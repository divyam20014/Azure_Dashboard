import type { IssueRecord } from '@/types/issue';
import type { Dataset } from '@/types/analytics';
import type { ReportCell, ReportColumn, ReportTable } from '@/lib/export/reportTables';
import { issueRegisterTable } from '@/lib/export/reportTables';
import { displayFilterValue, FILTER_FIELD_LABELS, FILTER_FIELDS } from '@/lib/analytics/filters';
import type { ChartConfig } from './chartConfig';
import { CHART_TYPE_LABELS } from './chartConfig';
import type { ChartData } from './chartData';
import { chartRecordIndexes } from './chartData';

const text = (header: string): ReportColumn => ({ header, kind: 'text' });

function valueColumn(header: string, data: ChartData): ReportColumn {
  const unit = data.seriesMetrics ? '' : data.metric.unit;
  if (unit === '%') return { header, kind: 'pct' };
  return { header, kind: unit === 'days' ? 'text' : 'int' };
}

function cellValue(v: number | null, data: ChartData): ReportCell {
  if (v === null) return null;
  const unit = data.seriesMetrics ? '' : data.metric.unit;
  if (unit === '%') return v / 100;
  if (unit === 'days') return Number(v.toFixed(1));
  return v;
}

/**
 * The exact values drawn by the chart: one row per drawn category, one column per series.
 * The same numbers are in the chart, its table view, the CSV and the Excel export.
 */
export function chartDataTable(data: ChartData, name = 'Chart Data'): ReportTable {
  // Single series only when there is no secondary grouping; a filtered-down secondary keeps its series name.
  const single = data.series.length === 1 && data.series[0].key === '__all';
  const columns: ReportColumn[] = [text('Category'), ...data.series.map((s) => valueColumn(single ? data.metric.label : s.label, data))];
  const showTotal = !single && (data.seriesMetrics ? false : data.metric.additive);
  if (showTotal) columns.push(valueColumn('Total', data));
  const rows: ReportCell[][] = data.categories.map((c, ci) => {
    const row: ReportCell[] = [c.label, ...data.series.map((_, si) => cellValue(data.cells[si][ci].value, data))];
    if (showTotal) row.push(cellValue(data.categoryValues[ci], data));
    return row;
  });
  return { name, columns, rows };
}

/** Plain-language description of the chart's configuration and scope, for the export. */
export function chartConfigTable(config: ChartConfig, data: ChartData, extra: { globalFilters: string; dimensionLabel: (id: string) => string; scopeRecords: number }): ReportTable {
  const chartFilters = FILTER_FIELDS.filter((f) => config.filters.criteria[f]?.length)
    .map((f) => `${FILTER_FIELD_LABELS[f]} = ${config.filters.criteria[f]!.map((v) => displayFilterValue(f, v)).join(' / ')}`)
    .concat(config.filters.createdFrom || config.filters.createdTo ? [`Created ${config.filters.createdFrom || '…'} to ${config.filters.createdTo || '…'}`] : [])
    .join('; ');
  const rows: ReportCell[][] = [
    ['Chart title', config.title || '(untitled)'],
    ['Chart type', CHART_TYPE_LABELS[config.type]],
    ['Grouping', extra.dimensionLabel(config.primary)],
    ['Secondary grouping', config.secondary === 'metrics' ? 'Compare metrics' : config.secondary ? extra.dimensionLabel(config.secondary) : 'None'],
    ['Metric', data.seriesMetrics ? data.seriesMetrics.map((m) => m.label).join(', ') : data.metric.label],
    ['How it is calculated', data.seriesMetrics ? data.seriesMetrics.map((m) => `${m.label}: ${m.explanation}`).join(' ') : data.metric.explanation],
    ['Global dashboard filters', extra.globalFilters || 'None'],
    ['Chart filters', chartFilters || 'None'],
    ['Records in dashboard scope', extra.scopeRecords],
    ['Records in chart scope', data.recordCount],
    ['Categories drawn', data.categories.length],
    ['Chart Records sheet', 'Mapped issue fields and source row number of every record behind the chart. Use the Issue Register export for all original columns.'],
    ['Categories hidden by Top-N', data.hidden.count ? `${data.hidden.count}${data.hidden.foldedIntoOther ? ' (combined into "Other")' : ' (not drawn; see "All Categories")'}` : 'None'],
    ...data.messages.map((m) => ['Note', m.text] as ReportCell[]),
  ];
  return { name: 'Chart Configuration', columns: [text('Item'), text('Detail')], rows };
}

/**
 * The issue records behind the drawn chart (the union of all drawn cells), with the mapped issue
 * fields and source row number. Every source column is left to the full Issue Register export:
 * copying ~50 columns × 100k rows into a chart workbook took minutes and blocked the page.
 */
export function chartRecordsTable(data: ChartData, dataset: Dataset): ReportTable {
  const set = new Set(chartRecordIndexes(data));
  const records: IssueRecord[] = dataset.records.filter((r) => set.has(r.index));
  return issueRegisterTable(records, dataset, 'Chart Records', { sourceColumns: false });
}
