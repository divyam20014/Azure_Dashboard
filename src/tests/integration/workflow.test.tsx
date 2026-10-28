import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import App from '@/App';
import { sampleCsv } from '../fixtures';
import { blobText, captureDownloads, clearData, expandSection, generateDashboard, kpiCount, uploadFile } from './helpers';

vi.mock('@/components/charts/EChart', async () => {
  const mod = await import('./echartsMock');
  return { EChart: mod.EChartMock };
});

function csvFile() {
  return new File([sampleCsv()], 'bugs.csv', { type: 'text/csv', lastModified: 1 });
}

describe('end-to-end workflow with a CSV file', () => {
  it('uploads, maps, analyses, filters, exports and clears', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('privacy-statement')).toHaveTextContent('Your file is processed locally in your browser.');

    // 1-3. Upload and parse; preview shows actual imported values.
    await uploadFile(user, csvFile());
    expect(screen.getByText('Login fails')).toBeInTheDocument();

    // 4. Column mapping was detected and is editable.
    await user.click(screen.getByRole('button', { name: /Column mapping/ }));
    expect(screen.getByLabelText(/^Status/)).toHaveValue('2');
    expect(screen.getByLabelText(/^Assignee/)).toHaveValue('3');
    expect(screen.getByLabelText(/^Priority/)).toHaveValue('4');

    // Value mapping: Blocked is unmapped until the user decides.
    await user.click(screen.getByRole('button', { name: /Value mapping/ }));
    expect(screen.getByLabelText('Workflow category for Blocked')).toHaveValue('unmapped');

    // 5-6. Generate the dashboard and check KPI counts.
    await generateDashboard(user);
    expect(kpiCount('total')).toBe('9');
    expect(kpiCount('closed')).toBe('2');
    expect(kpiCount('new')).toBe('3');
    expect(kpiCount('reopened')).toBe('1');
    expect(kpiCount('readyForQa')).toBe('1');
    expect(kpiCount('devInProgress')).toBe('1');
    expect(kpiCount('other')).toBe('1');
    expect(kpiCount('unassigned')).toBe('1');
    expect(screen.getByTestId('header-file')).toHaveTextContent('bugs.csv');
    expect(screen.getByTestId('summary-headline')).toHaveTextContent('Out of 9 issues, 2 are closed');

    // 7. Charts render real data.
    const donut = screen.getByLabelText('Donut chart of issues by status');
    expect(within(donut).getByText('New: 3')).toBeInTheDocument();
    await expandSection(user, 'Assignee Workload and Priority Matrix');
    const workload = screen.getByLabelText('Bar chart of issues per assignee');
    expect(within(workload).getByText('Ben Ito: 3')).toBeInTheDocument();
    const matrix = screen.getByTestId('assignee-priority-matrix');
    expect(within(matrix).getByLabelText('Ben Ito, P2: 2 issues')).toBeInTheDocument();

    // 8. KPI click filters the register; clicking again clears it.
    expect(screen.getByTestId('register-count')).toHaveTextContent('9 record(s)');
    await user.click(screen.getByTestId('kpi-closed'));
    expect(screen.getByTestId('register-count')).toHaveTextContent('2 record(s)');
    expect(screen.getByTestId('selection-chip')).toHaveTextContent('Closed (workflow)');
    expect(kpiCount('total')).toBe('9'); // selection does not change dashboard totals
    await user.click(screen.getByTestId('kpi-closed'));
    expect(screen.getByTestId('register-count')).toHaveTextContent('9 record(s)');

    // Chart click drill-down (matrix cell).
    await user.click(within(matrix).getByLabelText('Ben Ito, P2: 2 issues'));
    expect(screen.getByTestId('register-count')).toHaveTextContent('2 record(s)');
    await user.click(screen.getByRole('button', { name: 'Clear register selection' }));

    // Global filter (assignee drill-down) changes every section consistently.
    await user.selectOptions(screen.getByLabelText('Drill down into an assignee'), 'Asha Rao');
    await waitFor(() => expect(kpiCount('total')).toBe('3'));
    expect(kpiCount('new')).toBe('2');
    expect(screen.getByTestId('register-count')).toHaveTextContent('3 record(s)');

    // Search narrows the register (debounced).
    await user.type(screen.getByLabelText('Search issues'), 'login');
    await waitFor(() => expect(screen.getByTestId('register-count')).toHaveTextContent('1 record(s)'));

    // 9. Export the filtered records locally.
    const downloads = captureDownloads();
    try {
      await user.click(screen.getByRole('button', { name: /Export filtered \(CSV\)/ }));
      expect(downloads.blobs).toHaveLength(1);
      expect(downloads.names[0]).toMatch(/^bugs-filtered-issues-\d{4}-\d{2}-\d{2}\.csv$/);
      const csv = await blobText(downloads.blobs[0]);
      const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Login fails');
      expect(lines[1]).toContain('Asha Rao');
    } finally {
      downloads.restore();
    }

    // Counting rule: excluding duplicate IDs.
    await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(kpiCount('total')).toBe('9'));
    await user.selectOptions(screen.getByLabelText(/Counting rule/), 'unique');
    await waitFor(() => expect(kpiCount('total')).toBe('8'));

    // 10. Clear the dataset.
    await clearData(user);
    expect(screen.queryByTestId('header-file')).not.toBeInTheDocument();
    expect(screen.queryByTestId('kpi-total')).not.toBeInTheDocument();
    expect((screen.getByTestId('file-input') as HTMLInputElement).value).toBe('');
  });

  it('applies edited status mappings to the dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    await uploadFile(user, csvFile());
    await user.click(screen.getByRole('button', { name: /Value mapping/ }));
    const label = screen.getByLabelText('Normalized status for Blocked');
    await user.clear(label);
    await user.type(label, 'Development in Progress');
    await user.selectOptions(screen.getByLabelText('Workflow category for Blocked'), 'open');
    await generateDashboard(user);
    expect(kpiCount('devInProgress')).toBe('2');
    expect(kpiCount('other')).toBe('0');
  });

  it('shows a clear error for unsupported files and keeps the app usable', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);
    await user.upload(screen.getByTestId('file-input'), new File(['%PDF'], 'report.pdf'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported file type');
  });

  it('keeps the existing analysis when a replacement file fails', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);
    await uploadFile(user, csvFile());
    await generateDashboard(user);
    await user.click(screen.getByRole('button', { name: /Replace File/ }));
    await user.upload(screen.getByTestId('file-input'), new File(['ID,Title'], 'fake.xlsx'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('does not match its extension');
    expect(alert).toHaveTextContent('Your current analysis has been kept unchanged.');
    await user.click(screen.getByRole('button', { name: /Back to current analysis/ }));
    expect(kpiCount('total')).toBe('9');
  });
});

describe('end-to-end workflow with an Excel workbook', () => {
  function workbookFile(): File {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], ['Exported for QA review']]), 'Cover');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Bug export — Sprint 12'],
        [],
        ['Work Item ID', 'Title', 'Status', 'Assignee', 'Priority'],
        [1, 'Alpha', 'Closed', 'Dana Lee', 1],
        [2, 'Beta', 'Ready for QA', 'Dana Lee', 2],
        [3, 'Gamma', 'Resolved', 'Eli Park', 1],
      ]),
      'Bugs',
    );
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    return new File([new Uint8Array(data)], 'export.xlsx', { lastModified: 2 });
  }

  it('selects a worksheet, detects a non-first header row and builds the dashboard', async () => {
    const user = userEvent.setup();
    render(<App />);
    await uploadFile(user, workbookFile());

    const sheet = screen.getByLabelText('Worksheet');
    expect(sheet).toHaveValue('Cover');
    await user.selectOptions(sheet, 'Bugs');
    await waitFor(() => expect(screen.getByLabelText('Header row')).toHaveValue('2'));
    expect(screen.getByText('Gamma')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Value mapping/ }));
    expect(screen.getByText(/Bare numbers were labelled as P-levels/)).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow category for Resolved')).toHaveValue('unmapped');

    await generateDashboard(user);
    expect(kpiCount('total')).toBe('3');
    expect(kpiCount('closed')).toBe('1');
    expect(kpiCount('readyForQa')).toBe('1');
    expect(kpiCount('other')).toBe('1');
    expect(within(screen.getByTestId('closure-panel')).getByText('33.3%')).toBeInTheDocument();

    const downloads = captureDownloads();
    try {
      await user.click(screen.getByRole('button', { name: /Export Report/ }));
      await user.click(await screen.findByRole('menuitem', { name: /Excel workbook/ }));
      expect(downloads.blobs).toHaveLength(1);
      const buffer = await new Promise<ArrayBuffer>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as ArrayBuffer);
        r.readAsArrayBuffer(downloads.blobs[0]);
      });
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      expect(wb.SheetNames).toEqual([
        'Executive Summary',
        'Status Summary',
        'Priority Summary',
        'Assignee Summary',
        'Assignee-Priority Matrix',
        'Assignee-Status Summary',
        'Filtered Issue Register',
        'Data Quality Summary',
        'Data Quality Report',
      ]);
      const assignees = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Assignee Summary']);
      expect(assignees.find((r) => r['Assignee'] === 'Dana Lee')?.['Total Issues']).toBe(2);
    } finally {
      downloads.restore();
    }

    await clearData(user);
  });
});
