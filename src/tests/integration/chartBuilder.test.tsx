import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { sampleCsv } from '../fixtures';
import { blobText, captureDownloads, clearData, generateDashboard, kpiCount, uploadFile } from './helpers';

vi.mock('@/components/charts/EChart', async () => {
  const mod = await import('./echartsMock');
  return { EChart: mod.EChartMock };
});

const csvFile = () => new File([sampleCsv()], 'bugs.csv', { type: 'text/csv', lastModified: 11 });
const registerCount = () => Number((screen.getByTestId('register-count').textContent ?? '').match(/^\d+/)![0]);

async function setup() {
  const user = userEvent.setup();
  render(<App />);
  await uploadFile(user, csvFile());
  await generateDashboard(user);
  return user;
}

describe('Custom Chart Builder', () => {
  it('builds, reconfigures and drills into charts from one configuration panel', async () => {
    const user = await setup();
    const section = document.getElementById('builder')!;
    expect(within(section).getByText('No custom charts yet')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: /Add chart/ }));
    const card = within(section).getByTestId('builder-card-0');
    const c = within(card);

    // Default: issue count per assignee.
    expect(c.getByTestId('builder-title')).toHaveTextContent('Issue count by Assignee');
    let chart = c.getByRole('img');
    expect(within(chart).getByText('Asha Rao: 3')).toBeInTheDocument();
    expect(within(chart).getByText('Unassigned: 1')).toBeInTheDocument();
    expect(c.getByTestId('builder-subtitle')).toHaveTextContent('9 of 9 records in scope');

    // Changing the metric updates values and labels.
    await user.selectOptions(c.getByLabelText('D. Metric / value'), 'open');
    expect(c.getByTestId('builder-title')).toHaveTextContent('Open issue count by Assignee');
    chart = c.getByRole('img');
    expect(within(chart).getByText('Asha Rao: 2')).toBeInTheDocument();
    expect(c.getByText(/open \/ closed figures may be incomplete/)).toBeInTheDocument();

    // Adding a secondary grouping makes a single-series type incompatible — explained, not silently changed.
    await user.selectOptions(c.getByLabelText('D. Metric / value'), 'count');
    await user.selectOptions(c.getByLabelText('C. Secondary grouping / series'), 'priority');
    expect(c.getByText(/is not compatible with this data/)).toBeInTheDocument();
    expect(c.getAllByText(/Shows one series only/).length).toBeGreaterThanOrEqual(1);
    await user.selectOptions(c.getByLabelText('A. Chart type'), 'stacked');
    chart = c.getByRole('img');
    expect(within(chart).getByText('Ben Ito: 3')).toBeInTheDocument();

    // Heatmap of the same configuration: exact cell values.
    await user.selectOptions(c.getByLabelText('A. Chart type'), 'heatmap');
    const heat = c.getByTestId('builder-heatmap');
    expect(within(heat).getByLabelText('Ben Ito, P2: 2 issue count')).toBeInTheDocument();

    // Chart filters narrow only this chart — global KPIs stay unchanged.
    await user.click(c.getByRole('button', { name: 'Chart filter: Priority' }));
    await user.click(within(screen.getByRole('group', { name: 'Chart filter: Priority options' })).getByText('P2'));
    await user.keyboard('{Escape}');
    expect(c.getByText(/Chart filters: Priority: P2/)).toBeInTheDocument();
    const rows = within(c.getByTestId('builder-heatmap')).getAllByRole('row').slice(1, -1).map((r) => r.querySelector('th')!.textContent);
    expect(rows).toEqual(['Ben Ito', 'Unassigned']);
    expect(kpiCount('total')).toBe('9');

    // Click-to-filter: the register lists exactly that cell's records.
    await user.click(within(c.getByTestId('builder-heatmap')).getByLabelText('Ben Ito, P2: 2 issue count'));
    expect(registerCount()).toBe(2);
    expect(screen.getByTestId('selection-chip')).toHaveTextContent('Ben Ito · P2');
    expect(kpiCount('total')).toBe('9');
    await user.click(screen.getByRole('button', { name: 'Clear register selection' }));

    // Export: the CSV holds exactly the values shown.
    const downloads = captureDownloads();
    try {
      await user.click(c.getByRole('button', { name: 'Export chart data as CSV' }));
      const lines = (await blobText(downloads.blobs[0])).replace(/^﻿/, '').trim().split('\r\n');
      expect(lines[0]).toBe('Category,P2,Total');
      expect(lines.slice(1).sort()).toEqual(['Ben Ito,2,2', 'Unassigned,1,1']);
    } finally {
      downloads.restore();
    }

    // Reset restores the default configuration.
    await user.click(c.getByRole('button', { name: /Reset chart configuration/ }));
    expect(c.getByTestId('builder-title')).toHaveTextContent('Issue count by Assignee');
    expect(c.queryByText(/Chart filters:/)).not.toBeInTheDocument();
  });

  it('offers ready-made views, multiple charts, reorder and remove, and resets on Clear Data', async () => {
    const user = await setup();
    const section = document.getElementById('builder')!;
    const picker = within(section).getByLabelText('Add a chart from a ready-made view');
    // Presets that need unmapped columns are not offered (the fixture has no Project).
    await user.selectOptions(picker, 'p-by-state');
    await user.selectOptions(picker, 's-open-closed');
    expect(within(section).getByTestId('builder-card-0')).toHaveTextContent('Priority by state');
    const donut = within(within(section).getByTestId('builder-card-1')).getByRole('img');
    expect(within(donut).getByText('Open / Pending: 6')).toBeInTheDocument();
    expect(within(donut).getByText('Closed: 2')).toBeInTheDocument();
    expect(within(donut).getByText('Unmapped: 1')).toBeInTheDocument();

    await user.click(within(within(section).getByTestId('builder-card-1')).getByRole('button', { name: 'Move chart up' }));
    expect(within(section).getByTestId('builder-card-0')).toHaveTextContent('Open vs closed');
    await user.click(within(within(section).getByTestId('builder-card-0')).getByRole('button', { name: 'Remove chart' }));
    expect(within(section).queryByTestId('builder-card-1')).not.toBeInTheDocument();

    // Percent of total: denominators and labels.
    await user.click(within(section).getByRole('button', { name: /Add chart/ }));
    const card = within(within(section).getByTestId('builder-card-1'));
    await user.selectOptions(card.getByLabelText('D. Metric / value'), 'percentTotal');
    await user.selectOptions(card.getByLabelText('A. Chart type'), 'table');
    expect(within(card.getByTestId('builder-table')).getByLabelText(/Asha Rao, Percentage of total issues: 33\.3%/)).toBeInTheDocument();

    await clearData(user);
    await uploadFile(user, csvFile());
    await generateDashboard(user);
    await waitFor(() => expect(within(document.getElementById('builder')!).getByText('No custom charts yet')).toBeInTheDocument());
  });
});
