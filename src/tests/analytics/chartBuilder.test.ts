import { describe, expect, it } from 'vitest';
import { buildDataset, initialSetup } from '@/lib/normalization/datasetBuilder';
import { applyCountingRule, applyCriteria } from '@/lib/analytics/filters';
import { buildChartData, chartTypeAvailability, chartRecordIndexes, type ChartData } from '@/lib/charts/chartData';
import { defaultChartConfig, type ChartConfig } from '@/lib/charts/chartConfig';
import { availableDimensions } from '@/lib/charts/dimensions';
import { metricDefinitions } from '@/lib/charts/metrics';
import { CHART_PRESETS, configFromPreset } from '@/lib/charts/presets';
import { chartDataTable, chartRecordsTable } from '@/lib/charts/chartExport';
import { legendLayout, verticalLabelPlan, valueAxisSplits, compactNumber, categoryAxisWidth, CHART_FONT, textWidth } from '@/components/charts/chartLayout';
import { buildStackedOption } from '@/components/charts/StackedBarChart';
import { buildDonutOption } from '@/components/charts/StatusDonutChart';
import { buildBarOption } from '@/components/charts/SimpleBarChart';
import { sampleParsedFile } from '../fixtures';

/*
 * Fixture (9 records): 101 Closed Asha P1 · 102 New Asha P3 · 103 Reopened Ben P1 · 104 RFQA Ben P2 ·
 * 105 DevInProgress Carla P4 (bad date) · 106 Closed Unassigned P2 · 107 Blocked Carla (no priority, no date) ·
 * 104 New Ben P2 (duplicate) · (no id) New Asha "Urgent-ish". Created dates 2024-01-05 … 2024-01-12.
 */
const file = sampleParsedFile();
const ds = buildDataset(file, initialSetup(file));
const ctx = { dataset: ds, today: new Date(2024, 0, 20) };
const cfg = (patch: Partial<ChartConfig>): ChartConfig => ({ ...defaultChartConfig(), sort: 'alphaAsc', ...patch });
const table = (data: ChartData) => Object.fromEntries(data.categories.map((c, ci) => [c.label, Object.fromEntries(data.series.map((s, si) => [s.label, data.cells[si][ci].value]))]));
const single = (data: ChartData) => Object.fromEntries(data.categories.map((c, ci) => [c.label, data.cells[0][ci].value]));

describe('chart builder engine: groupings and metrics', () => {
  it('Assignee → issue count', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'assignee' }), ctx);
    expect(single(d)).toEqual({ 'Asha Rao': 3, 'Ben Ito': 3, 'Carla Diaz': 2, Unassigned: 1 });
    expect(d.recordCount).toBe(9);
    expect(d.totalValue).toBe(9);
  });

  it('Assignee → Priority (secondary grouping) with priorities in configured order', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'assignee', secondary: 'priority', type: 'stacked' }), ctx);
    expect(d.series.map((s) => s.label)).toEqual(['P1', 'P2', 'P3', 'P4', 'Urgent-ish', '(No Priority)']);
    expect(table(d)['Ben Ito']).toMatchObject({ P1: 1, P2: 2, P3: 0 });
    expect(table(d)['Carla Diaz']).toMatchObject({ P4: 1, '(No Priority)': 1 });
    expect(table(d)['Unassigned']).toMatchObject({ P2: 1 });
    // Every record is counted exactly once.
    expect(d.cells.flat().reduce((s, c) => s + (c.value ?? 0), 0)).toBe(9);
  });

  it('State → Assignee as percentage within each group (denominator = the state)', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'status', secondary: 'assignee', metric: 'percentGroup', type: 'grouped' }), ctx);
    expect(table(d)['New']['Asha Rao']).toBeCloseTo((2 / 3) * 100);
    expect(table(d)['New']['Ben Ito']).toBeCloseTo((1 / 3) * 100);
    for (const ci of d.categories.keys()) expect(d.series.reduce((s, _, si) => s + (d.cells[si][ci].value ?? 0), 0)).toBeCloseTo(100);
  });

  it('percentage of total uses all records in the chart scope as denominator', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'percentTotal' }), ctx);
    expect(single(d)['Asha Rao']).toBeCloseTo((3 / 9) * 100);
    expect(Object.values(single(d)).reduce<number>((s, v) => s + (v ?? 0), 0)).toBeCloseTo(100);
  });

  it('workflow metrics use the explicit status mapping and warn when it is incomplete', () => {
    const open = buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'open' }), ctx);
    expect(single(open)).toEqual({ 'Asha Rao': 2, 'Ben Ito': 3, 'Carla Diaz': 1, Unassigned: 0 });
    expect(open.messages.some((m) => /may be incomplete/.test(m.text))).toBe(true);
    const closed = buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'closed' }), ctx);
    expect(single(closed)).toEqual({ 'Asha Rao': 1, 'Ben Ito': 0, 'Carla Diaz': 0, Unassigned: 1 });
  });

  it('high-priority metrics follow the configured group, not an assumed P1/P2', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'status', metric: 'highPriority' }), ctx);
    expect(single(d)).toMatchObject({ Closed: 2, Reopened: 1, 'Ready for QA': 1, New: 1, 'Development in Progress': 0, Blocked: 0 });
    const customGroup = { ...ds, config: { ...ds.config, values: { ...ds.config.values, highPriority: ['P4'] } } };
    const c = buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'highPriority' }), { dataset: customGroup, today: ctx.today });
    expect(single(c)).toEqual({ 'Asha Rao': 0, 'Ben Ito': 0, 'Carla Diaz': 1, Unassigned: 0 });
    expect(metricDefinitions(customGroup).find((m) => m.id === 'highPriority')!.label).toMatch(/^P4 issue count/);
  });

  it('per-priority metrics exist only for configured levels', () => {
    const ids = metricDefinitions(ds).map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['priority:P1', 'priority:P2', 'priority:Urgent-ish']));
    const d = buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'priority:P2' }), ctx);
    expect(single(d)).toEqual({ 'Asha Rao': 0, 'Ben Ito': 2, 'Carla Diaz': 0, Unassigned: 1 });
  });

  it('average age excludes undated / invalid / future records and reports how many', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'avgAge' }), ctx);
    expect(single(d)['Asha Rao']).toBeCloseTo((15 + 14 + 8) / 3);
    expect(single(d)['Ben Ito']).toBeCloseTo((13 + 12 + 9) / 3);
    expect(single(d)['Carla Diaz']).toBeNull();
    expect(d.messages.some((m) => /2 record\(s\) without a valid/.test(m.text))).toBe(true);
  });

  it('distinct IDs count repeated IDs once and ignore blank IDs', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'distinctIds' }), ctx);
    expect(single(d)).toEqual({ 'Asha Rao': 2, 'Ben Ito': 2, 'Carla Diaz': 2, Unassigned: 1 });
  });

  it('compares several count metrics as series', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'assignee', secondary: 'metrics', compareMetrics: ['open', 'closed'], type: 'grouped' }), ctx);
    expect(d.series.map((s) => s.label)).toEqual(['Open issue count', 'Closed issue count']);
    expect(table(d)['Asha Rao']).toEqual({ 'Open issue count': 2, 'Closed issue count': 1 });
  });

  it('missing assignees are the Unassigned category; unknown states / priorities stay visible and flagged', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'status' }), ctx);
    const blocked = d.categories.find((c) => c.label === 'Blocked')!;
    expect(blocked.unmapped).toBe(true);
    expect(d.messages.some((m) => /Unmapped \/ unknown categories are shown as-is: Blocked/.test(m.text))).toBe(true);
    const p = buildChartData(ds.records, cfg({ primary: 'priority' }), ctx);
    expect(p.categories.filter((c) => c.unmapped).map((c) => c.label).sort()).toEqual(['(No Priority)', 'Urgent-ish']);
  });
});

describe('chart builder engine: scope, sorting, Top-N', () => {
  it('chart filters narrow only the chart and match applyCriteria (issue register logic)', () => {
    const config = cfg({ primary: 'assignee', filters: { criteria: { priority: ['P2'] }, createdFrom: '', createdTo: '' } });
    const d = buildChartData(ds.records, config, ctx);
    expect(single(d)).toEqual({ 'Ben Ito': 2, Unassigned: 1 });
    const expected = applyCriteria(ds.records, { priority: ['P2'] }).map((r) => r.index).sort();
    expect(chartRecordIndexes(d).sort()).toEqual(expected);
  });

  it('respects the duplicate-handling scope it is given', () => {
    const unique = applyCountingRule(ds.records, 'unique');
    const d = buildChartData(unique, cfg({ primary: 'assignee' }), ctx);
    expect(single(d)['Ben Ito']).toBe(2);
    expect(d.recordCount).toBe(8);
  });

  it('sorts by value, alphabetically and by configured priority order', () => {
    const byValue = buildChartData(ds.records, cfg({ primary: 'assignee', sort: 'valueAsc' }), ctx);
    expect(byValue.categories.map((c) => c.label)).toEqual(['Unassigned', 'Carla Diaz', 'Asha Rao', 'Ben Ito']);
    const alphaDesc = buildChartData(ds.records, cfg({ primary: 'assignee', sort: 'alphaDesc' }), ctx);
    expect(alphaDesc.categories.map((c) => c.label)).toEqual(['Unassigned', 'Carla Diaz', 'Ben Ito', 'Asha Rao']);
    const natural = buildChartData(ds.records, cfg({ primary: 'priority', sort: 'natural' }), ctx);
    expect(natural.categories.map((c) => c.label)).toEqual(['P1', 'P2', 'P3', 'P4', 'Urgent-ish', '(No Priority)']);
  });

  it('Top-N limits only the drawn categories and folds the rest into a valid "Other"', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'assignee', sort: 'valueDesc', display: { ...defaultChartConfig().display, topN: 5, showOther: true } }), ctx);
    expect(d.hidden.count).toBe(0);
    const top2 = buildChartData(ds.records, { ...cfg({ primary: 'assignee', sort: 'valueDesc' }), display: { ...defaultChartConfig().display, topN: 5 } }, ctx);
    expect(top2.categories).toHaveLength(4);
    const priority = cfg({ primary: 'priority', sort: 'valueDesc' });
    const t = buildChartData(ds.records, { ...priority, display: { ...priority.display, topN: 5, showOther: true } }, ctx);
    expect(t.hidden).toEqual({ count: 1, foldedIntoOther: true });
    expect(t.categories.at(-1)!.label).toBe('Other (1 categories)');
    expect(t.cells[0].reduce((s, c) => s + (c.value ?? 0), 0)).toBe(9); // nothing lost
    expect(t.recordCount).toBe(9);
  });

  it('never builds "Other" for non-additive metrics', () => {
    const c = cfg({ primary: 'priority', metric: 'avgAge', sort: 'valueDesc' });
    const d = buildChartData(ds.records, { ...c, display: { ...c.display, topN: 5, showOther: true } }, ctx);
    expect(d.categories.some((x) => x.other)).toBe(false);
    expect(d.messages.some((m) => /cannot be added up/.test(m.text))).toBe(true);
  });

  it('explains invalid or empty configurations instead of drawing wrong results', () => {
    expect(buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'percentGroup' }), ctx)).toMatchObject({ status: 'invalid' });
    expect(buildChartData(ds.records, cfg({ primary: 'assignee', secondary: 'assignee' }), ctx).status).toBe('invalid');
    const none = buildChartData(ds.records, cfg({ primary: 'assignee', filters: { criteria: { priority: ['Nope'] }, createdFrom: '', createdTo: '' } }), ctx);
    expect(none.status).toBe('empty');
    expect(none.messages[0].text).toMatch(/No records match/);
    const noStatus = buildDataset(file, { ...initialSetup(file), columnMapping: { ...initialSetup(file).columnMapping, status: null } });
    expect(buildChartData(noStatus.records, cfg({ primary: 'status' }), { dataset: noStatus }).status).toBe('invalid');
  });
});

describe('chart type compatibility and presets', () => {
  const avail = (c: ChartConfig) => Object.fromEntries(chartTypeAvailability(c, ctx).map((t) => [t.type, t.available]));
  it('offers only types that can show the configuration truthfully', () => {
    expect(avail(cfg({ primary: 'assignee' }))).toMatchObject({ bar: true, hbar: true, pie: true, stacked: false, heatmap: false, line: false, table: true });
    expect(avail(cfg({ primary: 'assignee', secondary: 'priority' }))).toMatchObject({ bar: false, stacked: true, grouped: true, percent: true, heatmap: true, pie: false });
    expect(avail(cfg({ primary: 'assignee', metric: 'avgAge' }))).toMatchObject({ pie: false, donut: false });
    expect(avail(cfg({ primary: 'createdMonth' }))).toMatchObject({ line: true, area: true });
    expect(avail(cfg({ primary: 'assignee', secondary: 'metrics' }))).toMatchObject({ grouped: true, stacked: false, heatmap: false });
    const reason = chartTypeAvailability(cfg({ primary: 'assignee' }), ctx).find((t) => t.type === 'line')!.reason;
    expect(reason).toMatch(/order/);
  });

  it('every preset produces a valid chart for a fully mapped dataset', () => {
    for (const p of CHART_PRESETS) {
      const d = buildChartData(ds.records, configFromPreset(p), ctx);
      expect([p.id, d.status]).toEqual([p.id, 'ok']);
    }
  });

  it('lists only dimensions present in the dataset, including suitable unmapped columns', () => {
    const dims = availableDimensions(ds);
    expect(dims.find((d) => d.id === 'project')).toMatchObject({ available: false });
    expect(dims.find((d) => d.id === 'createdMonth')).toMatchObject({ available: true, temporal: true });
    const withExtra = sampleParsedFile();
    withExtra.rows = withExtra.rows.map((r, i) => [...r, i === 0 ? 'Customer' : i % 2 ? 'Acme' : 'Globex']);
    const ds2 = buildDataset(withExtra, initialSetup(withExtra));
    expect(availableDimensions(ds2).some((d) => d.label === 'Column: Customer')).toBe(true);
  });

  it('exports exactly the drawn values', () => {
    const d = buildChartData(ds.records, cfg({ primary: 'assignee', secondary: 'priority', type: 'stacked' }), ctx);
    const t = chartDataTable(d);
    expect(t.columns.map((c) => c.header)).toEqual(['Category', 'P1', 'P2', 'P3', 'P4', 'Urgent-ish', '(No Priority)', 'Total']);
    expect(t.rows.find((r) => r[0] === 'Ben Ito')).toEqual(['Ben Ito', 1, 2, 0, 0, 0, 0, 3]);
    // Chart Records: mapped fields of exactly the drawn records, no bulk copy of every source column.
    const recs = chartRecordsTable(buildChartData(ds.records, cfg({ primary: 'assignee', filters: { criteria: { priority: ['P1'] }, createdFrom: '', createdTo: '' } }), ctx), ds);
    expect(recs.rows).toHaveLength(2);
    expect(recs.columns.some((c) => c.header.startsWith('Source: '))).toBe(false);
    expect(recs.columns[0].header).toBe('Source Row');
    // A secondary grouping filtered down to one series keeps that series' name in the export.
    const oneSeries = chartDataTable(buildChartData(ds.records, cfg({ primary: 'assignee', secondary: 'priority', type: 'heatmap', filters: { criteria: { priority: ['P2'] }, createdFrom: '', createdTo: '' } }), ctx));
    expect(oneSeries.columns.map((c) => c.header)).toEqual(['Category', 'P2', 'Total']);
    const pct = chartDataTable(buildChartData(ds.records, cfg({ primary: 'assignee', metric: 'percentTotal' }), ctx));
    expect(pct.columns[1].kind).toBe('pct');
    expect(pct.rows.find((r) => r[0] === 'Asha Rao')![1]).toBeCloseTo(3 / 9);
  });
});

describe('chart layout rules (no overlap by construction)', () => {
  const palette = { surface: '#fff', text: '#000', muted: '#666', grid: '#eee', tooltipBg: '#fff', tooltipBorder: '#ddd' };
  it('wraps legends onto more rows instead of paging, and reserves their height', () => {
    const names = Array.from({ length: 12 }, (_, i) => `Long state name number ${i}`);
    expect(legendLayout(names, 1200).rows).toBeLessThan(legendLayout(names, 320).rows);
    const option = buildStackedOption({ categories: ['A', 'B'], series: names.map((n) => ({ name: n, color: '#000', values: [1, 2] })), horizontal: true, mode: 'stacked', width: 320, height: 600, showTotals: true, valueAxisName: 'Issues', palette }) as {
      grid: { top: number };
      legend: { type: string };
    };
    expect(option.legend.type).toBe('plain');
    expect(option.grid.top).toBeGreaterThanOrEqual(legendLayout(names, 320).height);
  });

  it('keeps the chart font safe inside SVG attributes, so image exports stay valid XML', () => {
    // ECharts writes the font unescaped into style="…"; a double quote would break the SVG and PNG export.
    expect(CHART_FONT).not.toContain('"');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text style="font-family:${CHART_FONT};">x</text></svg>`;
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').getElementsByTagName('parsererror')).toHaveLength(0);
  });

  it('decides value-label visibility and axis-name room from the text actually drawn', () => {
    const items = ['Medium', 'High', 'Low', 'Critical', '(No Priority)', 'Unknown', 'Sev-X'].map((label, i) => ({ label, value: ([134, 97, 97, 48, 20, 17, 7][i] / 420) * 100, color: '#000' }));
    type BarOpt = { series: { label: { show: boolean } }[]; yAxis: { nameGap: number }; grid: { left: number } };
    const pct = (v: number) => `${v.toFixed(1)}%`;
    // Narrow: "23.1%" does not fit a 36px column even though "23.1" might.
    const narrow = buildBarOption({ items, horizontal: false, width: 324, height: 300, valueAxisName: 'Share', palette, formatValue: pct, formatTick: (v) => `${v}%` }) as unknown as BarOpt;
    expect(narrow.series[0].label.show).toBe(false);
    const wide = buildBarOption({ items, horizontal: false, width: 1000, height: 300, valueAxisName: 'Share', palette, formatValue: pct, formatTick: (v) => `${v}%` }) as unknown as BarOpt;
    expect(wide.series[0].label.show).toBe(true);
    // The rotated axis name sits beyond the widest tick label and inside the chart.
    expect(wide.yAxis.nameGap).toBeGreaterThan(textWidth('40%', 11));
    // Sized from the drawn ticks, never the unrounded maximum (31.904…%).
    expect(wide.yAxis.nameGap).toBeLessThan(textWidth('40%', 11) + 30);
    expect(wide.grid.left).toBeGreaterThanOrEqual(16);
  });

  it('falls back to horizontal bars when column labels cannot be read', () => {
    expect(verticalLabelPlan(['New', 'Closed', 'Open'], 600).preferHorizontal).toBe(false);
    expect(verticalLabelPlan(Array.from({ length: 12 }, () => 'Waiting for Customer Confirmation'), 300).preferHorizontal).toBe(true);
    // 35° labels are only used when the drawn slot keeps parallel labels apart (slot·sin35° > 16px line box).
    const pri = ['Medium', 'High', 'Low', 'Critical', '(No Priority)', 'Unknown', 'Sev-X'];
    expect(verticalLabelPlan(pri, 254).preferHorizontal).toBe(true);
    expect(verticalLabelPlan(pri, 520).rotate === 35 || !verticalLabelPlan(pri, 520).preferHorizontal).toBe(true);
  });

  it('reduces value-axis ticks on narrow charts and formats large numbers compactly', () => {
    expect(valueAxisSplits(200, 100000)).toBeLessThanOrEqual(3);
    expect(valueAxisSplits(900, 100)).toBe(5);
    expect(compactNumber(12500)).toBe('12.5K');
    expect(compactNumber(2_400_000)).toBe('2.4M');
    expect(categoryAxisWidth(['x'.repeat(200)], 400).truncates).toBe(true);
  });

  it('draws the donut centre total once and hides overlapping slice labels', () => {
    const o = buildDonutOption({ items: [{ label: 'A', count: 2, color: '#000' }, { label: 'B', count: 3, color: '#111' }], total: 5, selectable: false, width: 400, height: 320, palette, variant: 'donut', unit: 'issues' }) as {
      graphic: unknown[];
      series: { label: { show: boolean } }[];
    };
    expect(o.graphic).toHaveLength(2);
    expect(o.series[0].label.show).toBe(false);
  });

  it('hides permanent bar labels when bars are too thin (values stay in tooltips)', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ label: `C${i}`, value: i * 1000, color: '#000' }));
    const o = buildBarOption({ items, total: 1, horizontal: true, width: 400, height: 300, valueAxisName: 'Issues', palette }) as { series: { label: { show: boolean } }[] };
    expect(o.series[0].label.show).toBe(false);
  });
});
