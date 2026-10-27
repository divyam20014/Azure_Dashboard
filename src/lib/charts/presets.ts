import type { ChartConfig, ChartType, DimensionId, MetricId, SecondaryId, SortOrder } from './chartConfig';
import { DEFAULT_DISPLAY, EMPTY_FILTERS, newChartId } from './chartConfig';

export interface ChartPreset {
  id: string;
  group: 'Assignee' | 'Priority' | 'State';
  title: string;
  type: ChartType;
  primary: DimensionId;
  secondary: SecondaryId;
  metric: MetricId;
  compareMetrics?: MetricId[];
  sort?: SortOrder;
  /** Chart filters applied by the preset (e.g. open issues only). */
  categoryFilter?: string[];
}

/**
 * Ready-made views for the required assignee-, priority- and state-wise analytics.
 * They are only starting configurations for the same builder — not separate charts.
 */
export const CHART_PRESETS: ChartPreset[] = [
  { id: 'a-workload', group: 'Assignee', title: 'Assignee workload (issue count)', type: 'hbar', primary: 'assignee', secondary: null, metric: 'count' },
  { id: 'a-open', group: 'Assignee', title: 'Open issues per assignee', type: 'hbar', primary: 'assignee', secondary: null, metric: 'open' },
  { id: 'a-closed', group: 'Assignee', title: 'Closed issues per assignee', type: 'hbar', primary: 'assignee', secondary: null, metric: 'closed' },
  { id: 'a-rfqa', group: 'Assignee', title: 'Ready for QA per assignee', type: 'hbar', primary: 'assignee', secondary: null, metric: 'readyForQa' },
  { id: 'a-hp', group: 'Assignee', title: 'High-priority issues per assignee', type: 'hbar', primary: 'assignee', secondary: null, metric: 'highPriority' },
  { id: 'a-reopened', group: 'Assignee', title: 'Reopened (current state) per assignee', type: 'hbar', primary: 'assignee', secondary: null, metric: 'reopened' },
  { id: 'a-unmapped', group: 'Assignee', title: 'Unmapped-state issues per assignee', type: 'hbar', primary: 'assignee', secondary: null, metric: 'unmapped' },
  { id: 'a-by-state', group: 'Assignee', title: 'Assignee by state (stacked)', type: 'stacked', primary: 'assignee', secondary: 'status', metric: 'count' },
  { id: 'a-by-priority', group: 'Assignee', title: 'Assignee by priority (stacked)', type: 'stacked', primary: 'assignee', secondary: 'priority', metric: 'count' },
  { id: 'a-compare', group: 'Assignee', title: 'Assignee metric comparison (grouped)', type: 'grouped', primary: 'assignee', secondary: 'metrics', metric: 'count', compareMetrics: ['open', 'closed', 'highPriority', 'readyForQa'] },
  { id: 'a-priority-heatmap', group: 'Assignee', title: 'Assignee-Priority heatmap', type: 'heatmap', primary: 'assignee', secondary: 'priority', metric: 'count' },
  { id: 'a-priority-heatmap-open', group: 'Assignee', title: 'Assignee-Priority heatmap (open issues only)', type: 'heatmap', primary: 'assignee', secondary: 'priority', metric: 'count', categoryFilter: ['open'] },
  { id: 'a-state-heatmap', group: 'Assignee', title: 'Assignee-State heatmap', type: 'heatmap', primary: 'assignee', secondary: 'status', metric: 'count' },
  { id: 'a-table', group: 'Assignee', title: 'Assignee × priority table', type: 'table', primary: 'assignee', secondary: 'priority', metric: 'count' },
  { id: 'p-dist', group: 'Priority', title: 'Issue distribution by priority', type: 'bar', primary: 'priority', secondary: null, metric: 'count', sort: 'natural' },
  { id: 'p-share', group: 'Priority', title: 'Priority as a percentage of total', type: 'bar', primary: 'priority', secondary: null, metric: 'percentTotal', sort: 'natural' },
  { id: 'p-by-state', group: 'Priority', title: 'Priority by state', type: 'stacked', primary: 'priority', secondary: 'status', metric: 'count', sort: 'natural' },
  { id: 'p-by-assignee', group: 'Priority', title: 'Priority by assignee', type: 'stacked', primary: 'priority', secondary: 'assignee', metric: 'count', sort: 'natural' },
  { id: 'p-backlog-assignee', group: 'Priority', title: 'High-priority open backlog by assignee', type: 'hbar', primary: 'assignee', secondary: null, metric: 'highPriorityOpen' },
  { id: 'p-backlog-state', group: 'Priority', title: 'High-priority backlog by state', type: 'bar', primary: 'status', secondary: null, metric: 'highPriority', sort: 'natural' },
  { id: 'p-matrix', group: 'Priority', title: 'Priority × state matrix', type: 'heatmap', primary: 'priority', secondary: 'status', metric: 'count', sort: 'natural' },
  { id: 's-dist', group: 'State', title: 'Issue distribution by state', type: 'bar', primary: 'status', secondary: null, metric: 'count', sort: 'natural' },
  { id: 's-share', group: 'State', title: 'State share of total (%)', type: 'bar', primary: 'status', secondary: null, metric: 'percentTotal', sort: 'natural' },
  { id: 's-by-assignee', group: 'State', title: 'State by assignee', type: 'stacked', primary: 'status', secondary: 'assignee', metric: 'count', sort: 'natural' },
  { id: 's-by-priority', group: 'State', title: 'State by priority', type: 'stacked', primary: 'status', secondary: 'priority', metric: 'count', sort: 'natural' },
  { id: 's-open-closed', group: 'State', title: 'Open vs closed (workflow mapping)', type: 'donut', primary: 'category', secondary: null, metric: 'count', sort: 'natural' },
  { id: 's-backlog', group: 'State', title: 'State-wise open backlog', type: 'bar', primary: 'status', secondary: null, metric: 'open', sort: 'natural' },
  { id: 's-qa-queue', group: 'State', title: 'QA-ready queue by assignee', type: 'hbar', primary: 'assignee', secondary: null, metric: 'readyForQa' },
  { id: 's-pct-in-assignee', group: 'State', title: 'State mix within each assignee (100%)', type: 'percent', primary: 'assignee', secondary: 'status', metric: 'count' },
];

export function configFromPreset(preset: ChartPreset): ChartConfig {
  return {
    id: newChartId(),
    title: preset.title,
    subtitle: '',
    type: preset.type,
    primary: preset.primary,
    secondary: preset.secondary,
    metric: preset.metric,
    compareMetrics: preset.compareMetrics ?? ['open', 'closed'],
    filters: preset.categoryFilter ? { ...EMPTY_FILTERS, criteria: { category: preset.categoryFilter } } : EMPTY_FILTERS,
    sort: preset.sort ?? 'valueDesc',
    display: DEFAULT_DISPLAY,
  };
}
