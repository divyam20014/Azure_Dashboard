import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, FileSpreadsheet, SlidersHorizontal, Table2, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Notice } from '@/components/common/Common';
import { useToast } from '@/components/common/Toast';
import { ChartShell } from '@/components/charts/ChartShell';
import { useChartPalette } from '@/components/charts/chartTheme';
import { horizontalChartHeight, legendLayout, verticalLabelPlan } from '@/components/charts/chartLayout';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { buildChartData, chartTypeAvailability, type ChartData } from '@/lib/charts/chartData';
import { SIZE_HEIGHT, type ChartConfig } from '@/lib/charts/chartConfig';
import type { DimensionDef } from '@/lib/charts/dimensions';
import type { MetricDef } from '@/lib/charts/metrics';
import { chartConfigTable, chartDataTable, chartRecordsTable } from '@/lib/charts/chartExport';
import { csvBlob, tableToCsv } from '@/lib/export/csvExporter';
import { workbookBlob } from '@/lib/export/excelExporter';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { displayFilterValue, FILTER_FIELD_LABELS, FILTER_FIELDS } from '@/lib/analytics/filters';
import type { FilterField } from '@/types/analytics';
import { formatCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { ChartConfigPanel } from './ChartConfigPanel';
import { MatrixTable } from './MatrixTable';
import { builderChartOption, formatValue } from './builderChartOption';

interface Props {
  config: ChartConfig;
  index: number;
  count: number;
  dimensions: DimensionDef[];
  metrics: MetricDef[];
  filterFields: FilterField[];
  onReset: () => void;
}

export function autoTitle(config: ChartConfig, data: ChartData, dims: DimensionDef[]): string {
  const dim = (id: string) => dims.find((d) => d.id === id)?.label ?? id;
  const what = config.secondary === 'metrics' ? 'Metric comparison' : data.metric.label;
  return `${what} by ${dim(config.primary)}${config.secondary && config.secondary !== 'metrics' ? ` and ${dim(config.secondary)}` : ''}`;
}

function filterText(config: ChartConfig): string {
  const parts = FILTER_FIELDS.filter((f) => config.filters.criteria[f]?.length).map((f) => `${FILTER_FIELD_LABELS[f]}: ${config.filters.criteria[f]!.map((v) => displayFilterValue(f, v)).join(', ')}`);
  if (config.filters.createdFrom || config.filters.createdTo) parts.push(`Created ${config.filters.createdFrom || '…'} – ${config.filters.createdTo || '…'}`);
  return parts.join(' · ');
}

/** One configurable chart: its own panel, live preview, drill-down and exports. */
export function ChartBuilderCard({ config, index, count, dimensions, metrics, filterFields, onReset }: Props) {
  const { analytics, dataset, settings, selectRecords, scrollToRegister } = useDashboard();
  const notify = useToast();
  const p = useChartPalette();
  const [panelOpen, setPanelOpen] = useState(true);
  const ctx = useMemo(() => ({ dataset, metrics, dimensions }), [dataset, metrics, dimensions]);
  const data = useMemo(() => buildChartData(analytics.scoped, config, ctx), [analytics.scoped, config, ctx]);
  const types = useMemo(() => chartTypeAvailability(config, ctx), [config, ctx]);
  const typeOk = types.find((t) => t.type === config.type)?.available ?? false;
  const title = config.title || (data.status === 'ok' ? autoTitle(config, data, dimensions) : 'New chart');
  const chartFilters = filterText(config);
  const dimLabel = (id: string) => dimensions.find((d) => d.id === id)?.label ?? id;
  const subtitle =
    config.subtitle ||
    [
      data.seriesMetrics ? 'Issue counts per metric' : data.metric.explanation,
      `${formatCount(data.recordCount)} of ${formatCount(analytics.scopes.inScope)} records in scope`,
      chartFilters ? `Chart filters — ${chartFilters}` : null,
      analytics.filterDescription ? `Dashboard filters — ${analytics.filterDescription}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const drill = (ci: number, si: number) => {
    const cell = data.cells[si]?.[ci];
    if (!cell || cell.indexes.length === 0) return;
    const cat = data.categories[ci].label;
    const ser = config.secondary ? ` · ${data.series[si].label}` : '';
    selectRecords(`builder:${config.id}:${ci}:${si}`, `${title}: ${cat}${ser}`, cell.indexes);
    scrollToRegister();
  };

  const exportCsv = () => {
    downloadBlob(csvBlob(tableToCsv(chartDataTable(data))), exportFileName(dataset, `chart-${title}`.slice(0, 50), 'csv'));
    notify(`Chart data exported (${data.categories.length} categories as drawn).`);
  };
  const exportExcel = () => {
    const tables = [chartDataTable(data, 'Chart Data (as drawn)')];
    if (data.hidden.count > 0) {
      const all = buildChartData(analytics.scoped, { ...config, display: { ...config.display, topN: 'all', showOther: false } }, ctx);
      tables.push(chartDataTable(all, 'All Categories'));
    }
    tables.push(chartConfigTable(config, data, { globalFilters: analytics.filterDescription, dimensionLabel: dimLabel, scopeRecords: analytics.scopes.inScope }));
    tables.push(chartRecordsTable(data, dataset));
    downloadBlob(workbookBlob(tables), exportFileName(dataset, `chart-${title}`.slice(0, 50), 'xlsx'));
    notify('Chart workbook exported.');
  };

  const tabular = config.type === 'heatmap' || config.type === 'table';
  const baseHeight = SIZE_HEIGHT[config.display.size];
  const chartHeight = (width: number) => {
    const legendH = config.display.legend && data.series.length > 1 ? legendLayout(data.series.map((s) => s.label), width).height : 0;
    const horizontal =
      config.type === 'hbar' ||
      (config.type === 'bar' && verticalLabelPlan(data.categories.map((c) => c.label), width - 70).preferHorizontal) ||
      ((config.type === 'stacked' || config.type === 'grouped' || config.type === 'percent') && (config.primary === 'assignee' || data.categories.length > 8));
    return horizontal ? Math.max(baseHeight, horizontalChartHeight(data.categories.length * (config.type === 'grouped' ? Math.min(3, data.series.length) : 1), legendH)) : baseHeight + legendH;
  };
  const summary = data.categories
    .map((c, ci) => `${c.label}: ${data.series.map((s, si) => `${data.series.length > 1 ? `${s.label} ` : ''}${formatValue(data.cells[si][ci].value, data, false)}`).join(', ')}`)
    .join('; ');

  return (
    <Card className="overflow-hidden" data-testid={`builder-card-${index}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold" data-testid="builder-title" title={title}>
            {title}
          </h3>
          <p className="text-xs text-muted-foreground" data-testid="builder-subtitle">
            {subtitle}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen} aria-label={panelOpen ? 'Hide chart settings' : 'Show chart settings'}>
            <SlidersHorizontal /> {panelOpen ? 'Hide settings' : 'Settings'}
          </Button>
          <Button size="sm" variant="ghost" onClick={exportCsv} disabled={data.status !== 'ok'} aria-label="Export chart data as CSV">
            <Table2 /> CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={exportExcel} disabled={data.status !== 'ok'} aria-label="Export chart data as Excel">
            <FileSpreadsheet /> Excel
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => settings.addChart({ ...config, id: `${config.id}-copy-${Date.now()}`, title: config.title ? `${config.title} (copy)` : '' })} aria-label="Duplicate chart">
            <Copy />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={index === 0} onClick={() => settings.moveChart(config.id, -1)} aria-label="Move chart up">
            <ArrowUp />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={index === count - 1} onClick={() => settings.moveChart(config.id, 1)} aria-label="Move chart down">
            <ArrowDown />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => settings.removeChart(config.id)} aria-label="Remove chart">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className={cn('grid gap-4 p-4', panelOpen && 'lg:grid-cols-[340px_minmax(0,1fr)]')}>
        {panelOpen && (
          <div className="no-print min-w-0 lg:border-r lg:pr-4">
            <ChartConfigPanel
              config={config}
              onChange={settings.updateChart}
              onReset={onReset}
              dimensions={dimensions}
              metrics={metrics}
              types={types}
              scoped={analytics.scoped}
              filterFields={filterFields}
              hasCreated={dataset.config.columnMapping.created !== null}
            />
          </div>
        )}
        <div className="min-w-0 space-y-2" data-testid="builder-preview">
          {(chartFilters || analytics.filterDescription) && (
            <div className="flex flex-wrap gap-1 text-xs">
              {chartFilters && <Badge variant="secondary">Chart filters: {chartFilters}</Badge>}
              {analytics.filterDescription && <Badge variant="outline">Dashboard filters: {analytics.filterDescription}</Badge>}
            </div>
          )}
          {data.status !== 'ok' ? (
            <EmptyState title={data.status === 'empty' ? 'No matching records' : 'This chart cannot be calculated'}>{data.messages[0]?.text}</EmptyState>
          ) : !typeOk ? (
            <EmptyState title={`${types.find((t) => t.type === config.type)?.label} is not compatible with this data`}>
              {types.find((t) => t.type === config.type)?.reason} Compatible types: {types.filter((t) => t.available).map((t) => t.label).join(', ')}.
            </EmptyState>
          ) : tabular ? (
            <MatrixTable
              data={data}
              heatmap={config.type === 'heatmap'}
              compact={config.display.numberFormat === 'compact'}
              categoryHeader={dimLabel(config.primary)}
              onCellClick={drill}
            />
          ) : (
            <ChartShell
              exportTitle={title}
              exportName={`chart-${title}`}
              ariaLabel={`${title} (${types.find((t) => t.type === config.type)?.label})`}
              summary={summary}
              height={chartHeight}
              build={({ width, height }) => builderChartOption(config, data, analytics.colors, width, height, p)}
              onClick={(e) => drill(e.dataIndex, config.type === 'bar' || config.type === 'hbar' || config.type === 'pie' || config.type === 'donut' ? 0 : (e.seriesIndex ?? 0))}
            />
          )}
          {data.status === 'ok' &&
            data.messages.map((m) => (
              <Notice key={m.text} tone={m.tone}>
                {m.text}
              </Notice>
            ))}
          {data.status === 'ok' && (
            <p className="text-[11px] text-muted-foreground">
              Click a {tabular ? 'cell' : 'bar, segment or point'} to list its records in the Issue Register (register only — dashboard totals stay unchanged).
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
