import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as XLSX from 'xlsx';
import App from '@/App';
import { sampleCsv, SAMPLE_HEADERS, SAMPLE_ROWS } from '../fixtures';
import { blobText, captureDownloads, clearData, generateDashboard, kpiCount, uploadFile } from './helpers';

vi.mock('@/components/charts/EChart', async () => {
  const mod = await import('./echartsMock');
  return { EChart: mod.EChartMock };
});

const csvFile = (text = sampleCsv(), name = 'bugs.csv') => new File([text], name, { type: 'text/csv', lastModified: 7 });

/** 14 assignees with 1..14 issues each (105 issues): person "Dev 14" has the most. */
function manyAssigneesCsv(): string {
  const lines = ['ID,Title,State,Assigned To,Priority'];
  let id = 1;
  for (let a = 1; a <= 14; a++) {
    for (let k = 0; k < a; k++) lines.push(`${id++},Issue ${id},${k % 2 ? 'New' : 'Closed'},Dev ${String(a).padStart(2, '0')},P${(k % 4) + 1}`);
  }
  return lines.join('\n');
}

async function readXlsx(blob: Blob) {
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.readAsArrayBuffer(blob);
  });
  return XLSX.read(new Uint8Array(buffer), { type: 'array' });
}

const registerCount = () => Number((screen.getByTestId('register-count').textContent ?? '').match(/^[\d,]+/)![0].replace(/,/g, ''));

describe('executive dashboard, risks and assignee workload', () => {
  it('shows correct executive KPIs and filters the register from each card', async () => {
    const user = userEvent.setup();
    render(<App />);
    await uploadFile(user, csvFile());
    // Mapping is detected and can be corrected: unmap and remap Priority.
    await user.click(screen.getByRole('button', { name: /Column mapping/ }));
    const priority = screen.getByLabelText(/^Priority/);
    expect(priority).toHaveValue('4');
    await user.selectOptions(priority, '');
    expect(screen.getByText(/these analytics will be unavailable/)).toBeInTheDocument();
    await user.selectOptions(priority, '4');
    await generateDashboard(user);

    // Fixture: 9 records; closed 2; open 6; unmapped 1 (Blocked); P1 open 1, P2 open 2; reopened 1; RFQA 1; unassigned 1.
    expect(kpiCount('total')).toBe('9');
    expect(kpiCount('closed')).toBe('2');
    expect(kpiCount('closureRate')).toBe('22.2%');
    expect(screen.getByTestId('kpi-closureRate')).toHaveTextContent('Provisional');
    expect(kpiCount('openBacklog')).toBe('6');
    expect(kpiCount('highPriority')).toBe('3');
    expect(screen.getByTestId('kpi-highPriority')).toHaveTextContent('P1: 1 · P2: 2');
    expect(kpiCount('reopened')).toBe('1');
    expect(kpiCount('readyForQa')).toBe('1');
    expect(kpiCount('unassigned')).toBe('1');
    expect(kpiCount('unmapped')).toBe('1');
    expect(screen.getByTestId('kpi-total')).toHaveTextContent('10 rows imported · 9 valid records');

    await user.click(screen.getByTestId('kpi-openBacklog'));
    expect(registerCount()).toBe(6);
    expect(screen.getByTestId('kpi-openBacklog')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('kpi-highPriority'));
    expect(registerCount()).toBe(3);
    await user.click(screen.getByTestId('kpi-highPriority')); // toggle off
    expect(registerCount()).toBe(9);
    expect(kpiCount('total')).toBe('9'); // the base dataset is never replaced by a selection

    // Risk cards list the right records and drive the register.
    expect(within(screen.getByTestId('risk-high-priority')).getByTestId('risk-high-priority-count')).toHaveTextContent('3');
    expect(screen.getByTestId('risk-reopened-count')).toHaveTextContent('1');
    expect(screen.getByTestId('risk-unassigned-count')).toHaveTextContent('1');
    expect(screen.getByTestId('risk-qa-queue-count')).toHaveTextContent('1');
    expect(screen.getByTestId('risk-incomplete-count')).toHaveTextContent('2');
    await user.click(within(screen.getByTestId('risk-high-priority')).getByRole('button', { name: /View 3 in register/ }));
    expect(registerCount()).toBe(3);
    const ids = within(screen.getByTestId('issue-table')).getAllByRole('row').slice(1).map((r) => r.children[1].textContent);
    expect(ids.sort()).toEqual(['103', '104', '104']);
    // Exporting the selection exports exactly those records.
    const downloads = captureDownloads();
    try {
      await user.click(screen.getByRole('button', { name: 'Export the selected records as CSV' }));
      const csv = (await blobText(downloads.blobs[0])).replace(/^﻿/, '').trim().split('\r\n');
      expect(csv).toHaveLength(4);
    } finally {
      downloads.restore();
    }
    await user.click(screen.getByRole('button', { name: 'Clear register selection' }));

    // Heatmap: total and open-only modes.
    const matrix = screen.getByTestId('assignee-priority-matrix');
    expect(within(matrix).getByLabelText('Ben Ito, P2: 2 issues')).toBeInTheDocument();
    expect(within(matrix).getByLabelText('Asha Rao, P1: 1 issues')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Heatmap counts'), 'open');
    const openMatrix = screen.getByTestId('assignee-priority-matrix');
    expect(within(openMatrix).getByLabelText('Asha Rao, P1: 0 open issues')).toBeDisabled();
    expect(within(openMatrix).getByLabelText('Ben Ito, P2: 2 open issues')).toBeInTheDocument();

    // Assignee summary table values.
    const table = screen.getByTestId('assignee-summary-table');
    const ben = within(table).getByRole('button', { name: 'Ben Ito' }).closest('tr')!;
    // columns: Total, Closed, Open, P1, P2, P1 + P2, Reopened, Ready for QA
    expect([...ben.querySelectorAll('td')].slice(0, 8).map((td) => td.textContent)).toEqual(['3', '0', '3', '1', '2', '3', '1', '1']);
    expect(within(table).getByText('Unassigned (no owner)')).toBeInTheDocument();
  });

  it('applies Top-N and search to the assignee display without changing the data', async () => {
    const user = userEvent.setup();
    render(<App />);
    await uploadFile(user, csvFile(manyAssigneesCsv(), 'team.csv'));
    await generateDashboard(user);
    expect(kpiCount('total')).toBe('105');
    const count = () => screen.getByTestId('assignee-display-count').textContent;
    expect(count()).toMatch(/Showing 10 of 14 assignees/);
    await user.click(screen.getByRole('radio', { name: 'Top 5' }));
    expect(count()).toMatch(/Showing 5 of 14 assignees/);
    const rows = within(screen.getByTestId('assignee-summary-table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.querySelector('th')!.textContent)).toEqual(['Dev 14', 'Dev 13', 'Dev 12', 'Dev 11', 'Dev 10']);
    await user.click(screen.getByRole('radio', { name: 'All' }));
    expect(count()).toMatch(/Showing 14 of 14/);
    await user.type(screen.getByLabelText('Search assignees'), 'Dev 0');
    expect(count()).toMatch(/Showing 9 of 14/);
    expect(kpiCount('total')).toBe('105'); // display controls never filter records
    expect(registerCount()).toBe(105);
  });

  it('supports duplicate review: nothing is excluded until the user decides', async () => {
    const user = userEvent.setup();
    render(<App />);
    await uploadFile(user, csvFile());
    await generateDashboard(user);
    await user.selectOptions(screen.getByLabelText('Counting rule'), 'review');
    expect(kpiCount('total')).toBe('9');
    const dupTable = screen.getByTestId('duplicate-table');
    await user.click(within(dupTable).getByLabelText(/Exclude row 10 \(ID 104\)/));
    await waitFor(() => expect(kpiCount('total')).toBe('8'));
    expect(screen.getByTestId('scope-summary')).toHaveTextContent('9 imported, 1 excluded by the duplicate rule');
    await user.click(screen.getByRole('button', { name: 'Include all' }));
    await waitFor(() => expect(kpiCount('total')).toBe('9'));
  });
});

describe('management reports', () => {
  it('changes templates and sections, previews and exports locally', async () => {
    const user = userEvent.setup();
    render(<App />);
    await uploadFile(user, csvFile());
    await generateDashboard(user);

    await user.click(screen.getByRole('radio', { name: /Release Readiness Report/ }));
    expect(screen.getByTestId('header-context')).toHaveTextContent('Release Readiness Report');
    // Unsupported sections are disabled with a reason.
    expect(screen.getByLabelText('Include Snapshot comparison')).toBeDisabled();
    // Deselect a section and set a release criterion.
    await user.click(screen.getByLabelText('Include Data-quality report'));
    await user.type(screen.getByLabelText('Max open high-priority issues'), '0');

    await user.click(screen.getByRole('button', { name: /Preview report/ }));
    const report = screen.getByTestId('print-report');
    expect(within(report).getByTestId('report-title')).toHaveTextContent('Release Readiness Report');
    const sections = [...report.querySelectorAll('[data-report-section]')].map((s) => s.getAttribute('data-report-section'));
    expect(sections).toEqual(['summary', 'readiness', 'priority', 'risks', 'aging']);
    expect(within(report).getByTestId('readiness-statement')).toHaveTextContent('1 of 1 configured criteria are not met');
    expect(within(report).getByTestId('readiness-statement')).toHaveTextContent('not a formal release approval');
    expect(within(report).getByTestId('report-limitations')).toHaveTextContent('unmapped statuses');

    const downloads = captureDownloads();
    try {
      await user.click(within(screen.getByRole('dialog', { name: 'Printable report' })).getByRole('button', { name: /^Excel$/ }));
      const wb = await readXlsx(downloads.blobs[0]);
      expect(wb.SheetNames).toEqual(['Executive Summary', 'KPI Details', 'Release Readiness', 'Priority Summary', 'Risk and Attention Items', 'Risk Records', 'Aging (Age Since Creation)']);
      const kpis = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['KPI Details']);
      expect(kpis.find((r) => r.KPI === 'Open backlog')?.Value).toBe(6);
    } finally {
      downloads.restore();
    }
    await user.click(within(screen.getByRole('dialog', { name: 'Printable report' })).getByRole('button', { name: /Close/ }));

    // Workload template: register limited to the chosen assignee.
    await user.click(screen.getByRole('radio', { name: /Developer \/ Tester Workload Report/ }));
    await user.click(screen.getByRole('button', { name: 'Report assignees' }));
    await user.click(within(screen.getByRole('group', { name: 'Report assignees options' })).getByText('Ben Ito'));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /Preview report/ }));
    const workload = screen.getByTestId('print-report');
    expect(workload.querySelector('[data-report-section="register"] h2')).toHaveTextContent('Detailed issue register (3)');
  });
});

describe('snapshot comparison and full cleanup', () => {
  it('compares with an earlier snapshot in memory and Clear Data removes everything', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);
    await uploadFile(user, csvFile());
    await generateDashboard(user);

    // Earlier export: 103 was Closed, 106 did not exist, 999 existed.
    const earlier = [SAMPLE_HEADERS, ...SAMPLE_ROWS.map((r) => [...r])];
    earlier[3][2] = 'Closed';
    earlier[6][0] = '999';
    const text = earlier.map((r) => r.map((v) => (v === null ? '' : /[",\s]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(',')).join('\n');
    await user.upload(screen.getByTestId('comparison-file-input'), csvFile(text, 'last-week.csv'));
    const result = await screen.findByTestId('comparison-result');
    expect(result).toHaveTextContent('Previous: last-week.csv');
    expect(within(result).getByText(/Newly observed \(not necessarily new issues\)/).parentElement).toHaveTextContent('(1)');
    expect(within(result).getByText(/Moved from Closed back to Open/).parentElement).toHaveTextContent('(1)');
    expect(screen.getByTestId('header-context')).toHaveTextContent('Comparing with: last-week.csv');

    // Set some state everywhere, then clear.
    await user.click(screen.getByTestId('kpi-openBacklog'));
    await user.click(screen.getByRole('radio', { name: /Weekly Management Report/ }));
    await clearData(user);
    expect(document.body.textContent).not.toContain('last-week.csv');

    // A fresh upload starts from a clean state: no comparison, default template, no filters.
    await uploadFile(user, csvFile());
    await generateDashboard(user);
    expect(screen.queryByTestId('comparison-result')).not.toBeInTheDocument();
    expect(screen.getByTestId('header-context')).toHaveTextContent('Daily QA Status Report');
    expect(screen.queryByTestId('selection-chip')).not.toBeInTheDocument();
    expect(registerCount()).toBe(9);
  });
});
