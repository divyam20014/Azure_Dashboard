import type { IssueRecord } from '@/types/issue';
import type { Dataset } from '@/types/analytics';
import { applyCreatedRange, applyCriteria } from '@/lib/analytics/filters';
import type { ChartConfig, ChartType, DimensionId, MetricId } from './chartConfig';
import { CHART_TYPE_LABELS } from './chartConfig';
import { availableDimensions, categoryLabel, dimensionKey, isUnmappedCategory, naturalCompare, type DimensionDef } from './dimensions';
import { ageInDays, metricById, metricDefinitions, type MetricDef } from './metrics';

export interface ChartCell {
  /** Metric value; null when it cannot be computed (e.g. average with no dated records). */
  value: number | null;
  /** Records counted by the metric in this cell (the drill-down / export set). */
  indexes: number[];
  /** All records in the cell (denominator for "percentage within group"). */
  base: number;
}

export interface ChartCategory {
  key: string;
  label: string;
  unmapped: boolean;
  /** Synthetic "Other" bucket built from categories hidden by Top-N. */
  other?: boolean;
}

export interface ChartSeries {
  key: string;
  label: string;
}

export interface ChartMessage {
  tone: 'info' | 'warning';
  text: string;
}

export interface ChartData {
  status: 'ok' | 'empty' | 'invalid';
  messages: ChartMessage[];
  metric: MetricDef;
  /** Metric definitions of the series when comparing metrics. */
  seriesMetrics?: MetricDef[];
  categories: ChartCategory[];
  series: ChartSeries[];
  /** cells[seriesIndex][categoryIndex] */
  cells: ChartCell[][];
  /** Metric value per category over all its records (ignores the secondary grouping). */
  categoryValues: (number | null)[];
  /** Records in the chart scope (global scope + chart filters). */
  recordCount: number;
  /** Metric over the whole chart scope (e.g. total open issues). */
  totalValue: number | null;
  /** Categories hidden by Top-N (and whether they were folded into "Other"). */
  hidden: { count: number; foldedIntoOther: boolean };
  /** Series beyond the readable limit that were folded or dropped. */
  hiddenSeries: number;
}

export const MAX_SERIES = 12;
export const MAX_PIE_SLICES = 12;
const ONE_SERIES = '__all';

export interface ChartContext {
  dataset: Dataset;
  /** Date used for ages (default: today). */
  today?: Date;
  /** Precomputed definitions (optional, for speed). */
  metrics?: MetricDef[];
  dimensions?: DimensionDef[];
}

interface Acc {
  matches: number[];
  base: number;
  ageSum: number;
  ageN: number;
  ids: Set<string>;
}
const newAcc = (): Acc => ({ matches: [], base: 0, ageSum: 0, ageN: 0, ids: new Set() });

function add(acc: Acc, r: IssueRecord, metric: MetricDef, today: Date) {
  acc.base++;
  if (metric.kind === 'average') {
    const age = ageInDays(r, today);
    if (age !== null) {
      acc.ageSum += age;
      acc.ageN++;
      acc.matches.push(r.index);
    }
    return;
  }
  if (metric.kind === 'distinct') {
    if (r.id) {
      acc.ids.add(r.id);
      acc.matches.push(r.index);
    }
    return;
  }
  if (!metric.predicate || metric.predicate(r)) acc.matches.push(r.index);
}

function value(acc: Acc, metric: MetricDef, scopeTotal: number, groupBase: number): number | null {
  switch (metric.kind) {
    case 'count':
      return acc.matches.length;
    case 'percentTotal':
      return scopeTotal ? (acc.matches.length / scopeTotal) * 100 : null;
    case 'percentGroup':
      return groupBase ? (acc.matches.length / groupBase) * 100 : null;
    case 'average':
      return acc.ageN ? acc.ageSum / acc.ageN : null;
    case 'distinct':
      return acc.ids.size;
  }
}

/** Records the chart shows: the dashboard's scope narrowed by the chart's own filters. */
export function applyChartFilters(records: IssueRecord[], config: ChartConfig): IssueRecord[] {
  return applyCreatedRange(applyCriteria(records, config.filters.criteria), config.filters.createdFrom, config.filters.createdTo);
}

/**
 * Group and measure records for a chart configuration. One function serves every chart
 * type and every grouping, so all charts use the same rules. `records` must already be the
 * dashboard scope (duplicate rule + global filters); the original records are never modified.
 */
export function buildChartData(records: IssueRecord[], config: ChartConfig, ctx: ChartContext): ChartData {
  const today = ctx.today ?? new Date();
  const metrics = ctx.metrics ?? metricDefinitions(ctx.dataset);
  const dims = ctx.dimensions ?? availableDimensions(ctx.dataset);
  const metric = metricById(metrics, config.metric) ?? metrics[0];
  const messages: ChartMessage[] = [];
  const empty = (status: ChartData['status'], text: string): ChartData => ({
    status,
    messages: [{ tone: status === 'empty' ? 'info' : 'warning', text }],
    metric,
    categories: [],
    series: [],
    cells: [],
    categoryValues: [],
    recordCount: 0,
    totalValue: null,
    hidden: { count: 0, foldedIntoOther: false },
    hiddenSeries: 0,
  });

  const primaryDef = dims.find((d) => d.id === config.primary);
  if (!primaryDef?.available) return empty('invalid', primaryDef?.reason ?? 'The selected grouping is not available in this dataset.');
  const compare = config.secondary === 'metrics';
  const secondaryDef = config.secondary && !compare ? dims.find((d) => d.id === config.secondary) : undefined;
  if (config.secondary && !compare && !secondaryDef?.available) return empty('invalid', secondaryDef?.reason ?? 'The secondary grouping is not available in this dataset.');
  if (config.secondary === config.primary) return empty('invalid', 'Choose a secondary grouping different from the primary grouping.');
  const seriesMetrics = compare ? config.compareMetrics.map((id) => metricById(metrics, id)).filter((d): d is MetricDef => !!d && d.available && d.kind === 'count') : undefined;
  if (compare && (!seriesMetrics || seriesMetrics.length === 0)) return empty('invalid', 'Select at least one count metric to compare.');
  if (!compare && !metric.available) return empty('invalid', `${metric.label} cannot be calculated: ${metric.reason}`);
  if (!compare && metric.kind === 'percentGroup' && !config.secondary) return empty('invalid', 'Percentage within each group needs a secondary grouping (e.g. Assignee → State).');

  const scoped = applyChartFilters(records, config);
  if (scoped.length === 0) return { ...empty('empty', 'No records match the chart and dashboard filters.'), recordCount: 0 };

  // Group: category -> series -> accumulator (single pass).
  const byCategory = new Map<string, Map<string, Acc[]>>();
  const categoryAcc = new Map<string, Acc>();
  const seriesTotals = new Map<string, number>();
  const totalAcc = newAcc();
  const seriesKeysOf = (r: IssueRecord): string[] => (compare ? seriesMetrics!.map((d) => d.id) : [config.secondary ? dimensionKey(r, config.secondary as DimensionId) : ONE_SERIES]);
  for (const r of scoped) {
    const ck = dimensionKey(r, config.primary);
    let ser = byCategory.get(ck);
    if (!ser) {
      ser = new Map();
      byCategory.set(ck, ser);
      categoryAcc.set(ck, newAcc());
    }
    if (!compare) {
      add(categoryAcc.get(ck)!, r, metric, today);
      add(totalAcc, r, metric, today);
    }
    for (const [si, sk] of seriesKeysOf(r).entries()) {
      let accs = ser.get(sk);
      if (!accs) {
        accs = [newAcc()];
        ser.set(sk, accs);
      }
      const m = compare ? seriesMetrics![si] : metric;
      const before = accs[0].matches.length;
      add(accs[0], r, m, today);
      seriesTotals.set(sk, (seriesTotals.get(sk) ?? 0) + (accs[0].matches.length - before));
    }
  }

  // Series order: compared metrics as chosen; a secondary dimension in its natural order.
  let seriesKeys: string[];
  if (compare) seriesKeys = seriesMetrics!.map((d) => d.id);
  else if (!config.secondary) seriesKeys = [ONE_SERIES];
  else {
    const keys = [...seriesTotals.keys()];
    const natural = naturalCompare(config.secondary as DimensionId, ctx.dataset.config.values.priorityOrder);
    const ordered = secondaryDef!.ordered ? keys.sort(natural) : keys.sort((a, b) => (seriesTotals.get(b) ?? 0) - (seriesTotals.get(a) ?? 0) || natural(a, b));
    seriesKeys = ordered;
  }
  let hiddenSeries = 0;
  if (!compare && config.secondary && seriesKeys.length > MAX_SERIES && config.type !== 'heatmap' && config.type !== 'table') {
    // Keep the largest series readable; the rest are listed in the table / heatmap views.
    const byTotal = [...seriesKeys].sort((a, b) => (seriesTotals.get(b) ?? 0) - (seriesTotals.get(a) ?? 0));
    const keep = new Set(byTotal.slice(0, MAX_SERIES));
    hiddenSeries = seriesKeys.length - MAX_SERIES;
    seriesKeys = seriesKeys.filter((k) => keep.has(k));
    messages.push({ tone: 'warning', text: `${hiddenSeries} smaller series are not drawn to keep the chart readable. Use the heatmap or table view to see all of them, or add a chart filter.` });
  }

  const recordCount = scoped.length;
  const categoryBase = (ck: string) => categoryAcc.get(ck)?.base ?? [...(byCategory.get(ck)?.values() ?? [])].reduce((s, a) => s + a[0].base, 0);
  const cellFor = (ck: string, sk: string, m: MetricDef): ChartCell => {
    const acc = byCategory.get(ck)?.get(sk)?.[0];
    if (!acc) return { value: m.kind === 'average' ? null : 0, indexes: [], base: 0 };
    return { value: value(acc, m, recordCount, categoryBase(ck)), indexes: acc.matches, base: acc.base };
  };
  const categoryValue = (ck: string): number | null => {
    if (compare) return seriesKeys.reduce((s, sk, i) => s + (cellFor(ck, sk, seriesMetrics![i]).value ?? 0), 0);
    const acc = categoryAcc.get(ck)!;
    return metric.kind === 'percentGroup' ? (acc.base ? 100 : null) : value(acc, metric, recordCount, acc.base);
  };

  // Sort categories.
  let catKeys = [...byCategory.keys()];
  const natural = naturalCompare(config.primary, ctx.dataset.config.values.priorityOrder);
  const labelOf = (k: string) => categoryLabel(config.primary, k);
  const vals = new Map(catKeys.map((k) => [k, categoryValue(k) ?? -Infinity]));
  switch (config.sort) {
    case 'valueDesc':
      catKeys.sort((a, b) => vals.get(b)! - vals.get(a)! || natural(a, b));
      break;
    case 'valueAsc':
      catKeys.sort((a, b) => vals.get(a)! - vals.get(b)! || natural(a, b));
      break;
    case 'alphaAsc':
      catKeys.sort((a, b) => labelOf(a).localeCompare(labelOf(b), undefined, { numeric: true }));
      break;
    case 'alphaDesc':
      catKeys.sort((a, b) => labelOf(b).localeCompare(labelOf(a), undefined, { numeric: true }));
      break;
    case 'natural':
      catKeys.sort(natural);
      break;
  }

  // Top-N (presentation only) with an optional mathematically valid "Other" bucket.
  const additive = compare || metric.additive;
  let hiddenKeys: string[] = [];
  const topN = config.display.topN;
  if (topN !== 'all' && catKeys.length > topN) {
    hiddenKeys = catKeys.slice(topN);
    catKeys = catKeys.slice(0, topN);
  }
  const foldOther = hiddenKeys.length > 0 && config.display.showOther && additive;
  if (hiddenKeys.length > 0 && config.display.showOther && !additive) {
    messages.push({ tone: 'info', text: `"Other" is not shown: ${metric.label.toLowerCase()} cannot be added up across categories.` });
  }

  const categories: ChartCategory[] = catKeys.map((k) => ({ key: k, label: labelOf(k), unmapped: isUnmappedCategory(config.primary, k, ctx.dataset) }));
  const cells: ChartCell[][] = seriesKeys.map((sk, si) => catKeys.map((ck) => cellFor(ck, sk, compare ? seriesMetrics![si] : metric)));
  const categoryValues = catKeys.map((k) => categoryValue(k));
  if (foldOther) {
    categories.push({ key: '__other', label: `Other (${hiddenKeys.length} categories)`, unmapped: false, other: true });
    seriesKeys.forEach((sk, si) => {
      const parts = hiddenKeys.map((ck) => cellFor(ck, sk, compare ? seriesMetrics![si] : metric));
      const indexes = parts.flatMap((p) => p.indexes);
      const base = parts.reduce((s, p) => s + p.base, 0);
      const m = compare ? seriesMetrics![si] : metric;
      const v = m.kind === 'percentTotal' ? (recordCount ? (indexes.length / recordCount) * 100 : null) : indexes.length;
      cells[si].push({ value: v, indexes, base });
    });
    categoryValues.push(hiddenKeys.reduce((s, k) => s + (categoryValue(k) ?? 0), 0));
  }
  if (hiddenKeys.length > 0) {
    messages.push({
      tone: 'info',
      text: `Top ${topN} shown: ${hiddenKeys.length} more ${hiddenKeys.length === 1 ? 'category is' : 'categories are'} ${foldOther ? 'combined into "Other"' : 'not drawn'}. This only affects the chart, not other dashboard figures.`,
    });
  }

  // Data-quality notes that affect this chart.
  const unmappedShown = categories.filter((c) => c.unmapped).map((c) => c.label);
  if (unmappedShown.length) messages.push({ tone: 'warning', text: `Unmapped / unknown categories are shown as-is: ${unmappedShown.join(', ')}.` });
  const usesWorkflow = (m: MetricDef) => ['closed', 'open', 'highPriorityOpen'].includes(m.id);
  if ((compare ? seriesMetrics!.some(usesWorkflow) : usesWorkflow(metric)) && Object.values(ctx.dataset.config.values.status).some((r) => r.category === 'unmapped')) {
    messages.push({ tone: 'warning', text: 'Some states are not mapped to Open or Closed, so open / closed figures may be incomplete.' });
  }
  if (!compare && metric.kind === 'average') {
    const excluded = recordCount - totalAcc.ageN;
    if (excluded > 0) messages.push({ tone: 'info', text: `${excluded} record(s) without a valid, past Created Date are excluded from the average.` });
  }

  return {
    status: 'ok',
    messages,
    metric,
    seriesMetrics,
    categories,
    series: seriesKeys.map((k, i) => ({ key: k, label: compare ? seriesMetrics![i].label : k === ONE_SERIES ? metric.label : categoryLabel(config.secondary as DimensionId, k) })),
    cells,
    categoryValues,
    recordCount,
    totalValue: compare ? null : value(totalAcc, metric, recordCount, recordCount),
    hidden: { count: hiddenKeys.length, foldedIntoOther: foldOther },
    hiddenSeries,
  };
}

export interface TypeAvailability {
  type: ChartType;
  label: string;
  available: boolean;
  reason?: string;
}

/** Which chart types can show this configuration truthfully, with the reason when not. */
export function chartTypeAvailability(config: ChartConfig, ctx: ChartContext): TypeAvailability[] {
  const metrics = ctx.metrics ?? metricDefinitions(ctx.dataset);
  const dims = ctx.dimensions ?? availableDimensions(ctx.dataset);
  const metric = metricById(metrics, config.metric);
  const compare = config.secondary === 'metrics';
  const hasDimSecondary = !!config.secondary && !compare;
  const additive = compare || !!metric?.additive;
  const temporalOrOrdered = dims.find((d) => d.id === config.primary)?.ordered ?? false;
  const check = (type: ChartType, reason: string | null): TypeAvailability => ({ type, label: CHART_TYPE_LABELS[type], available: reason === null, reason: reason ?? undefined });
  return [
    check('bar', config.secondary ? 'Shows one series only — use stacked, grouped or heatmap for two groupings.' : null),
    check('hbar', config.secondary ? 'Shows one series only — use stacked, grouped or heatmap for two groupings.' : null),
    check('stacked', !hasDimSecondary ? 'Needs a secondary grouping (stacking compared metrics would double-count records).' : !additive ? `${metric?.label} cannot be stacked (values do not add up).` : null),
    check('grouped', !config.secondary ? 'Needs a secondary grouping or "Compare metrics".' : null),
    check('percent', !hasDimSecondary ? 'Needs a secondary grouping.' : !additive ? `${metric?.label} cannot be shown as shares of 100 %.` : null),
    check('line', !temporalOrOrdered ? 'Lines imply an order; use a date, priority, state or workflow grouping.' : null),
    check('area', !temporalOrOrdered ? 'Areas imply an order; use a date, priority, state or workflow grouping.' : !additive ? `${metric?.label} cannot be shown as filled areas.` : null),
    check('pie', config.secondary ? 'Shows one grouping only.' : !additive || metric?.kind === 'percentTotal' ? 'Only for counts that add up to a whole.' : null),
    check('donut', config.secondary ? 'Shows one grouping only.' : !additive || metric?.kind === 'percentTotal' ? 'Only for counts that add up to a whole.' : null),
    check('heatmap', !hasDimSecondary ? 'Needs a secondary grouping (rows × columns).' : null),
    check('table', null),
  ];
}

/** Records behind the visible chart (union of all drawn cells), for drill-down and export. */
export function chartRecordIndexes(data: ChartData): number[] {
  const set = new Set<number>();
  for (const row of data.cells) for (const c of row) for (const i of c.indexes) set.add(i);
  return [...set];
}

export type { MetricId };
