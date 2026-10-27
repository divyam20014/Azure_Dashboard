import type { ChartOption } from '@/components/charts/EChart';
import type { ChartPalette } from '@/components/charts/chartTheme';
import { baseTooltip, swatch } from '@/components/charts/chartTheme';
import { buildBarOption } from '@/components/charts/SimpleBarChart';
import { buildStackedOption } from '@/components/charts/StackedBarChart';
import { buildDonutOption } from '@/components/charts/StatusDonutChart';
import { canShowBarLabels, compactNumber, LABEL_LINE_HEIGHT, legendLayout, VALUE_AXIS_NAME_SPACE, valueAxisNameGap, valueAxisSplits, verticalLabelPlan } from '@/components/charts/chartLayout';
import type { ChartConfig } from '@/lib/charts/chartConfig';
import type { ChartData } from '@/lib/charts/chartData';
import { escapeHtml, formatCount } from '@/lib/text';

/** Categorical palette (validated for colour-vision deficiency in this order). */
export const SERIES_PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#0891b2', '#a16207', '#be185d', '#4d7c0f'];

export interface ColorContext {
  status: Record<string, string>;
  priority: Record<string, string>;
}

/** Colour per series: the dashboard's semantic colours for states / priorities, a fixed palette otherwise. */
export function seriesColors(config: ChartConfig, data: ChartData, colors: ColorContext): string[] {
  return data.series.map((s, i) => {
    if (config.secondary === 'status') return colors.status[s.key] ?? SERIES_PALETTE[i % SERIES_PALETTE.length];
    if (config.secondary === 'priority') return colors.priority[s.key] ?? SERIES_PALETTE[i % SERIES_PALETTE.length];
    return SERIES_PALETTE[i % SERIES_PALETTE.length];
  });
}

export function categoryColors(config: ChartConfig, data: ChartData, colors: ColorContext): string[] {
  return data.categories.map((c, i) => {
    if (config.primary === 'status') return colors.status[c.key] ?? SERIES_PALETTE[i % SERIES_PALETTE.length];
    if (config.primary === 'priority') return colors.priority[c.key] ?? SERIES_PALETTE[i % SERIES_PALETTE.length];
    if (config.primary === 'category') return ({ closed: '#16a34a', open: '#2563eb', unmapped: '#64748b' } as Record<string, string>)[c.key] ?? '#64748b';
    return config.type === 'pie' || config.type === 'donut' ? SERIES_PALETTE[i % SERIES_PALETTE.length] : '#2a78d6';
  });
}

/** Format a metric value for labels / tooltips; exact by default. */
export function formatValue(v: number | null, data: ChartData, compact: boolean): string {
  if (v === null) return '—';
  const unit = data.seriesMetrics ? '' : data.metric.unit;
  if (unit === '%') return `${v.toFixed(1)}%`;
  if (unit === 'days') return `${v.toFixed(1)} d`;
  return compact ? compactNumber(v) : formatCount(v);
}

/** Value-axis tick text in the metric's unit (35%, 4.5 d, 1.2K). */
function tickFormatter(data: ChartData): (v: number) => string {
  const unit = data.seriesMetrics ? '' : data.metric.unit;
  if (unit === '%') return (v) => `${v}%`;
  if (unit === 'days') return (v) => `${compactNumber(v)} d`;
  return compactNumber;
}

function applyDisplay(option: Record<string, unknown>, config: ChartConfig): ChartOption {
  const d = config.display;
  const axes = ['xAxis', 'yAxis'] as const;
  for (const a of axes) {
    const axis = option[a] as Record<string, unknown> | undefined;
    if (axis && axis.type === 'value') axis.splitLine = { ...(axis.splitLine as object), show: d.gridlines };
  }
  if (!d.dataLabels && Array.isArray(option.series)) for (const s of option.series as Record<string, unknown>[]) s.label = { ...(s.label as object), show: false };
  return option;
}

function lineOption(config: ChartConfig, data: ChartData, colors: string[], width: number, height: number, p: ChartPalette, area: boolean): ChartOption {
  const compact = config.display.numberFormat === 'compact';
  const labels = data.categories.map((c) => c.label);
  const legend = config.display.legend && data.series.length > 1 ? legendLayout(data.series.map((s) => s.label), width) : { height: 0, labelWidth: 0, rows: 0 };
  const plan = verticalLabelPlan(labels, width - 70);
  const max = Math.max(0, ...data.cells.flatMap((row) => row.map((c) => c.value ?? 0)));
  const showPoints = width / Math.max(1, labels.length) >= 24;
  const tick = tickFormatter(data);
  const longest = data.cells.flatMap((row) => row.map((c) => formatValue(c.value, data, compact))).reduce((m, t) => (t.length > m.length ? t : m), '');
  const showLabels = showPoints && data.series.length === 1 && canShowBarLabels((width - 70) / Math.max(1, labels.length), false, longest, 0);
  return {
    grid: { left: VALUE_AXIS_NAME_SPACE, right: 16, top: legend.height + 14, bottom: 8, containLabel: true },
    legend: legend.rows ? { type: 'plain', top: 0, left: 0, width: width - 8, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: p.text, fontSize: 12, width: legend.labelWidth, overflow: 'truncate' } } : { show: false },
    tooltip: {
      ...baseTooltip(p),
      trigger: 'axis',
      formatter: (params: { dataIndex: number }[]) => {
        const ci = params[0]?.dataIndex ?? 0;
        return `<b>${escapeHtml(labels[ci] ?? '')}</b><br/>${data.series.map((s, si) => `${swatch(colors[si])}${escapeHtml(s.label)}: <b>${formatValue(data.cells[si][ci].value, data, false)}</b>`).join('<br/>')}`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: !area,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.grid } },
      axisLabel: { color: p.text, fontSize: 12, interval: plan.preferHorizontal ? 'auto' : 0, rotate: plan.preferHorizontal ? 35 : plan.rotate, width: plan.preferHorizontal ? 110 : plan.labelWidth, overflow: plan.wrap ? 'break' : 'truncate', lineHeight: LABEL_LINE_HEIGHT, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      splitNumber: valueAxisSplits(height - legend.height - 80, max),
      name: data.seriesMetrics ? 'Issues' : data.metric.label,
      nameLocation: 'middle',
      nameGap: valueAxisNameGap(max, tick),
      nameMoveOverlap: false,
      nameTextStyle: { color: p.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: p.grid } },
      axisLabel: { color: p.muted, fontSize: 11, hideOverlap: true, formatter: tick },
    },
    series: data.series.map((s, si) => ({
      type: 'line',
      name: s.label,
      smooth: false,
      symbolSize: 7,
      showSymbol: showPoints,
      stack: area && data.series.length > 1 ? 'total' : undefined,
      areaStyle: area ? { opacity: 0.12 } : undefined,
      lineStyle: { width: 2, color: colors[si] },
      itemStyle: { color: colors[si] },
      connectNulls: false,
      labelLayout: { hideOverlap: true },
      label: { show: showLabels, position: 'top', color: p.text, fontSize: 11, formatter: (x: { value: number }) => formatValue(x.value, data, compact) },
      data: data.cells[si].map((c) => c.value),
    })),
  };
}

/** ECharts option for any non-tabular builder chart type, sized for the container. */
export function builderChartOption(config: ChartConfig, data: ChartData, colorCtx: ColorContext, width: number, height: number, p: ChartPalette): ChartOption {
  const compact = config.display.numberFormat === 'compact';
  const sColors = seriesColors(config, data, colorCtx);
  const cColors = categoryColors(config, data, colorCtx);
  const valueName = data.seriesMetrics ? 'Issues' : data.metric.label;
  const countLike = !data.seriesMetrics && (data.metric.kind === 'count' || data.metric.kind === 'distinct');
  switch (config.type) {
    case 'bar':
    case 'hbar': {
      const items = data.categories.map((c, ci) => ({ label: c.label, value: data.cells[0][ci].value ?? 0, color: cColors[ci] }));
      const showPct = config.display.percentages && countLike && data.totalValue;
      const horizontal = config.type === 'hbar' || verticalLabelPlan(items.map((i) => i.label), width - 70).preferHorizontal;
      const o = buildBarOption({
        items,
        total: showPct ? (data.totalValue as number) : undefined,
        horizontal,
        width,
        height,
        valueAxisName: valueName,
        palette: p,
        formatValue: showPct ? undefined : (v) => formatValue(v, data, compact),
        formatTick: tickFormatter(data),
      }) as Record<string, unknown>;
      return applyDisplay(o, config);
    }
    case 'stacked':
    case 'grouped':
    case 'percent': {
      const o = buildStackedOption({
        categories: data.categories.map((c) => c.label),
        series: data.series.map((s, si) => ({ name: s.label, color: sColors[si], values: data.cells[si].map((c) => c.value ?? 0) })),
        horizontal: verticalLabelPlan(data.categories.map((c) => c.label), width - 70).preferHorizontal || config.primary === 'assignee',
        mode: config.type === 'grouped' ? 'grouped' : config.type === 'percent' ? 'percent' : 'stacked',
        width,
        height,
        showTotals: config.type === 'stacked' && countLike,
        valueAxisName: valueName,
        palette: p,
        showLegend: config.display.legend,
        formatValue: (v) => formatValue(v, data, compact),
        formatTick: tickFormatter(data),
      }) as Record<string, unknown>;
      return applyDisplay(o, config);
    }
    case 'line':
    case 'area':
      return applyDisplay(lineOption(config, data, sColors, width, height, p, config.type === 'area') as Record<string, unknown>, config);
    case 'pie':
    case 'donut':
      return buildDonutOption({
        items: data.categories.map((c, ci) => ({ label: c.label, count: data.cells[0][ci].value ?? 0, color: cColors[ci] })),
        total: data.totalValue ?? data.cells[0].reduce((s, c) => s + (c.value ?? 0), 0),
        selectable: true,
        width,
        height,
        palette: p,
        variant: config.type,
        unit: data.metric.kind === 'count' ? 'issues' : data.metric.label.toLowerCase(),
        showLegend: config.display.legend,
      });
    default:
      return {};
  }
}
