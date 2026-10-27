import type { Criteria } from '@/types/analytics';

/** Every visualization the builder can draw. */
export type ChartType = 'bar' | 'hbar' | 'stacked' | 'grouped' | 'percent' | 'line' | 'area' | 'pie' | 'donut' | 'heatmap' | 'table';

/**
 * A grouping of records. Built-in fields come from the mapped columns; `column:<n>` is an
 * imported column that is not mapped to a dashboard field (only offered when suitable).
 */
export type DimensionId =
  | 'assignee'
  | 'priority'
  | 'status'
  | 'category'
  | 'type'
  | 'project'
  | 'area'
  | 'iteration'
  | 'severity'
  | 'createdMonth'
  | 'createdWeek'
  | `column:${number}`;

/** Second grouping: another dimension, "compare metrics" (one series per metric), or none. */
export type SecondaryId = DimensionId | 'metrics' | null;

export type MetricId =
  | 'count'
  | 'percentTotal'
  | 'percentGroup'
  | 'closed'
  | 'open'
  | 'unmapped'
  | 'highPriority'
  | 'highPriorityOpen'
  | `priority:${string}`
  | 'reopened'
  | 'readyForQa'
  | 'unassigned'
  | 'avgAge'
  | 'distinctIds';

/** Chart-only filters; they never change the global dashboard filters. */
export interface ChartFilters {
  criteria: Criteria;
  createdFrom: string;
  createdTo: string;
}

/** natural = configured order (priority mapping, workflow order, chronological dates). */
export type SortOrder = 'valueDesc' | 'valueAsc' | 'alphaAsc' | 'alphaDesc' | 'natural';

export type TopN = 5 | 10 | 20 | 'all';

export interface DisplayOptions {
  dataLabels: boolean;
  legend: boolean;
  gridlines: boolean;
  /** Show the share of the chart total next to values (count-type metrics). */
  percentages: boolean;
  numberFormat: 'exact' | 'compact';
  topN: TopN;
  /** Aggregate categories beyond Top-N into "Other" (only for additive metrics). */
  showOther: boolean;
  size: 'compact' | 'standard' | 'expanded';
}

export interface ChartConfig {
  id: string;
  title: string;
  subtitle: string;
  type: ChartType;
  primary: DimensionId;
  secondary: SecondaryId;
  metric: MetricId;
  /** Series when secondary = 'metrics'. */
  compareMetrics: MetricId[];
  filters: ChartFilters;
  sort: SortOrder;
  display: DisplayOptions;
}

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: 'Bar chart (columns)',
  hbar: 'Horizontal bar chart',
  stacked: 'Stacked bar chart',
  grouped: 'Grouped / clustered bar chart',
  percent: '100% stacked bar chart',
  line: 'Line chart',
  area: 'Area chart',
  pie: 'Pie chart',
  donut: 'Donut chart',
  heatmap: 'Heatmap',
  table: 'Table view',
};

export const SIZE_HEIGHT: Record<DisplayOptions['size'], number> = { compact: 300, standard: 380, expanded: 520 };

export const DEFAULT_DISPLAY: DisplayOptions = {
  dataLabels: true,
  legend: true,
  gridlines: true,
  percentages: false,
  numberFormat: 'exact',
  topN: 'all',
  showOther: false,
  size: 'standard',
};

export const EMPTY_FILTERS: ChartFilters = { criteria: {}, createdFrom: '', createdTo: '' };

let nextId = 1;
export function newChartId(): string {
  return `chart-${nextId++}`;
}

/** Default configuration: issue count per assignee (or the first available grouping). */
export function defaultChartConfig(primary: DimensionId = 'assignee'): ChartConfig {
  return {
    id: newChartId(),
    title: '',
    subtitle: '',
    type: primary === 'assignee' ? 'hbar' : 'bar',
    primary,
    secondary: null,
    metric: 'count',
    compareMetrics: ['open', 'closed'],
    filters: EMPTY_FILTERS,
    sort: 'valueDesc',
    display: DEFAULT_DISPLAY,
  };
}
