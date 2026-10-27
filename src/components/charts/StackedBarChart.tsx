import { ChartShell } from './ChartShell';
import { baseTooltip, tooltipLine, useChartPalette, type ChartPalette } from './chartTheme';
import { categoryAxisWidth, compactNumber, horizontalChartHeight, legendLayout, valueAxisSplits, verticalLabelPlan, LABEL_LINE_HEIGHT, LEGEND_ITEM_GAP, VALUE_AXIS_NAME_SPACE, valueAxisNameGap } from './chartLayout';
import { escapeHtml, formatCount, formatPercent, percentOf } from '@/lib/text';
import type { ChartOption } from './EChart';

export interface StackSeries {
  name: string;
  color: string;
  values: number[];
}

/** stacked: absolute stacks · grouped: side-by-side bars · percent: 100 % stacks. */
export type BarMode = 'stacked' | 'grouped' | 'percent';

interface Props {
  categories: string[];
  series: StackSeries[];
  orientation?: 'horizontal' | 'vertical' | 'auto';
  mode?: BarMode;
  onSelect?: (category: string, seriesName: string) => void;
  height?: number;
  ariaLabel: string;
  /** Append each category's total to its axis label. */
  showTotals?: boolean;
  /** Kept for compatibility; label widths are now fitted to the container. */
  labelWidth?: number;
  valueAxisName?: string;
  title?: string;
}

/** @deprecated height is derived from data, legend and container; kept for existing imports. */
export function stackedChartHeight(count: number): number {
  return horizontalChartHeight(count, 30);
}

export function buildStackedOption(args: {
  categories: string[];
  series: StackSeries[];
  horizontal: boolean;
  mode: BarMode;
  width: number;
  height: number;
  showTotals: boolean;
  valueAxisName: string;
  palette: ChartPalette;
  showLegend?: boolean;
  formatValue?: (v: number) => string;
  /** Value-axis tick text (ignored in percent mode, which always shows %). */
  formatTick?: (v: number) => string;
}): ChartOption {
  const { categories, series, horizontal, mode, width, height, showTotals, valueAxisName, palette: p } = args;
  const fmt = args.formatValue ?? formatCount;
  const tick = (v: number) => (mode === 'percent' ? `${v}%` : (args.formatTick ?? compactNumber)(v));
  const totals = categories.map((_, ci) => series.reduce((sum, s) => sum + (s.values[ci] ?? 0), 0));
  const showLegend = args.showLegend ?? true;
  const legend = showLegend ? legendLayout(series.map((s) => s.name), width) : { rows: 0, height: 0, labelWidth: 0 };
  const index = new Map(categories.map((c, i) => [c, i]));
  const axisText = (c: string) => {
    const i = index.get(c);
    return showTotals && mode !== 'percent' && i !== undefined ? `${c} (${fmt(totals[i])})` : c;
  };
  const percentOfCategory = (v: number, ci: number) => (totals[ci] ? (v / totals[ci]) * 100 : 0);
  const values = (s: StackSeries) => (mode === 'percent' ? s.values.map((v, ci) => Number(percentOfCategory(v ?? 0, ci).toFixed(4))) : s.values);
  const maxValue = mode === 'percent' ? 100 : mode === 'grouped' ? Math.max(0, ...series.flatMap((s) => s.values)) : Math.max(0, ...totals);

  let categoryAxis: Record<string, unknown>;
  let splitNumber: number;
  if (horizontal) {
    const cat = categoryAxisWidth(categories.map(axisText), width);
    splitNumber = valueAxisSplits(width - cat.width - 60, maxValue);
    categoryAxis = {
      type: 'category',
      data: categories,
      inverse: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.grid } },
      axisLabel: { color: p.text, fontSize: 12, width: cat.width, overflow: 'truncate', ellipsis: '…', interval: 0, formatter: axisText },
    };
  } else {
    const plan = verticalLabelPlan(categories.map(axisText), width - 70);
    splitNumber = valueAxisSplits(height - legend.height - plan.height - 60, maxValue);
    categoryAxis = {
      type: 'category',
      data: categories,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.grid } },
      axisLabel: {
        color: p.text,
        fontSize: 12,
        interval: 0,
        rotate: plan.preferHorizontal ? 35 : plan.rotate,
        width: plan.preferHorizontal ? 120 : plan.labelWidth,
        overflow: plan.wrap ? 'break' : 'truncate',
        ellipsis: '…',
        lineHeight: LABEL_LINE_HEIGHT,
        formatter: axisText,
      },
    };
  }
  const valueAxis = {
    type: 'value',
    minInterval: mode === 'percent' ? undefined : 1,
    max: mode === 'percent' ? 100 : undefined,
    splitNumber,
    name: mode === 'percent' ? '% of category' : valueAxisName,
    nameLocation: 'middle',
    nameGap: horizontal ? 26 : valueAxisNameGap(maxValue, tick),
    nameMoveOverlap: false,
    nameTextStyle: { color: p.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: p.grid } },
    axisLabel: { color: p.muted, fontSize: 11, hideOverlap: true, formatter: tick },
  };
  return {
    grid: { left: horizontal ? 8 : VALUE_AXIS_NAME_SPACE, right: 24, top: legend.height + 10, bottom: horizontal ? 30 : 8, containLabel: true },
    legend: showLegend
      ? {
          type: 'plain',
          top: 3,
          left: 2,
          width: width - 12,
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 10,
          itemGap: LEGEND_ITEM_GAP,
          padding: 0,
          textStyle: { color: p.text, fontSize: 12, width: legend.labelWidth, overflow: 'truncate', ellipsis: '…' },
          tooltip: { show: true },
        }
      : { show: false },
    tooltip: {
      ...baseTooltip(p),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: { dataIndex: number }[]) => {
        const ci = params[0]?.dataIndex ?? 0;
        const lines = series
          .filter((s) => (s.values[ci] ?? 0) !== 0)
          .map((s) => (mode === 'percent' ? `${tooltipLine(s.color, s.name, s.values[ci], totals[ci])}` : tooltipLine(s.color, s.name, s.values[ci], mode === 'grouped' ? undefined : totals[ci])));
        return `<b>${escapeHtml(categories[ci] ?? '')}</b>${mode === 'grouped' ? '' : ` — ${fmt(totals[ci] ?? 0)} total`}<br/>${lines.join('<br/>') || 'No issues'}`;
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: series.map((s) => ({
      type: 'bar',
      name: s.name,
      stack: mode === 'grouped' ? undefined : 'total',
      barMaxWidth: mode === 'grouped' ? 14 : 22,
      itemStyle: { color: s.color, borderColor: p.surface, borderWidth: mode === 'grouped' ? 0 : 1 },
      emphasis: { focus: 'series' },
      data: values(s),
    })),
  };
}

/**
 * Multi-series bars with a wrapped legend (never paged, never over the plot) and an axis
 * tooltip listing every non-zero segment with its exact value.
 */
export function StackedBarChart({ categories, series, orientation = 'horizontal', mode = 'stacked', onSelect, height, ariaLabel, showTotals = true, valueAxisName = 'Issues', title }: Props) {
  const p = useChartPalette();
  const isHorizontal = (width: number) => orientation === 'horizontal' || (orientation === 'auto' && verticalLabelPlan(categories, width - 70).preferHorizontal);
  const legendHeight = (width: number) => legendLayout(series.map((s) => s.name), width).height;
  const summary = categories
    .map((c, ci) => `${c}: ${series.filter((s) => (s.values[ci] ?? 0) > 0).map((s) => `${s.name} ${formatCount(s.values[ci])}`).join(', ') || 'none'}`)
    .join('; ');
  return (
    <ChartShell
      ariaLabel={ariaLabel}
      summary={summary}
      exportTitle={title}
      exportName={title}
      height={(width) => height ?? (isHorizontal(width) ? horizontalChartHeight(categories.length, legendHeight(width)) : 330 + legendHeight(width) + verticalLabelPlan(categories, width - 70).height)}
      build={({ width, height: h }) => buildStackedOption({ categories, series, horizontal: isHorizontal(width), mode, width, height: h, showTotals, valueAxisName, palette: p })}
      onClick={onSelect ? (e) => onSelect(categories[e.dataIndex] ?? e.name, e.seriesName ?? '') : undefined}
    />
  );
}

/** Percent of a category total, for tables next to percent charts. */
export function categoryShare(value: number, total: number): string {
  return formatPercent(percentOf(value, total));
}
