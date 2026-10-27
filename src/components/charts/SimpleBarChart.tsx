import { ChartShell } from './ChartShell';
import { baseTooltip, tooltipLine, useChartPalette, type ChartPalette } from './chartTheme';
import { canShowBarLabels, categoryAxisWidth, compactNumber, horizontalChartHeight, textWidth, valueAxisSplits, verticalLabelPlan, LABEL_LINE_HEIGHT, VALUE_AXIS_NAME_SPACE, valueAxisNameGap, rotatedLabelOverhang } from './chartLayout';
import { formatCount, formatPercent, percentOf } from '@/lib/text';
import type { ChartOption } from './EChart';

export interface BarItem {
  label: string;
  value: number;
  color: string;
}

interface Props {
  items: BarItem[];
  /** When given, bar labels and tooltips also show the share of this total. */
  total?: number;
  /** 'auto' draws columns when their labels fit and horizontal bars otherwise. */
  orientation?: 'horizontal' | 'vertical' | 'auto';
  selected?: string | null;
  onSelect?: (label: string) => void;
  height?: number;
  ariaLabel: string;
  /** Kept for compatibility; label widths are now fitted to the container. */
  labelWidth?: number;
  valueAxisName?: string;
  /** Chart title used for image export (enables the chart toolbar). */
  title?: string;
}

/** @deprecated height is derived from the data and container; kept for existing imports. */
export function barChartHeight(count: number): number {
  return horizontalChartHeight(count);
}

function valueText(value: number, total: number | undefined): string {
  return total !== undefined ? `${formatCount(value)} (${formatPercent(percentOf(value, total))})` : formatCount(value);
}

export function buildBarOption(args: {
  items: BarItem[];
  total?: number;
  horizontal: boolean;
  selected?: string | null;
  width: number;
  height: number;
  valueAxisName: string;
  palette: ChartPalette;
  /** Value-label text; layout decisions are made with exactly this text. Defaults to count (share). */
  formatValue?: (v: number) => string;
  /** Value-axis tick text. */
  formatTick?: (v: number) => string;
}): ChartOption {
  const { items, total, horizontal, selected, width, height, valueAxisName, palette: p } = args;
  const label = args.formatValue ?? ((v: number) => valueText(v, total));
  const tick = args.formatTick ?? compactNumber;
  const labels = items.map((i) => i.label);
  const maxValue = items.reduce((m, i) => Math.max(m, i.value), 0);
  const longestValue = items.reduce((m, i) => (textWidth(label(i.value), 11) > textWidth(m, 11) ? label(i.value) : m), '');
  const valueLabelPx = textWidth(longestValue, 11) + 10;

  let categoryAxis: Record<string, unknown>;
  let grid: Record<string, unknown>;
  let showLabels: boolean;
  let splitNumber: number;
  if (horizontal) {
    const cat = categoryAxisWidth(labels, width);
    const plotHeight = height - 56;
    const band = plotHeight / Math.max(1, items.length);
    showLabels = canShowBarLabels(band, true, longestValue, valueLabelPx);
    const right = (showLabels ? valueLabelPx : 0) + 16;
    splitNumber = valueAxisSplits(width - cat.width - right - 24, maxValue);
    grid = { left: 8, right, top: 8, bottom: 30, containLabel: true };
    categoryAxis = {
      type: 'category',
      data: labels,
      inverse: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.grid } },
      axisLabel: { color: p.text, fontSize: 12, width: cat.width, overflow: 'truncate', ellipsis: '…', interval: 0 },
    };
  } else {
    const plotWidth = width - 70;
    const plan = verticalLabelPlan(labels, plotWidth);
    const rawSlot = plotWidth / Math.max(1, items.length);
    const rotated = plan.preferHorizontal || plan.rotate !== 0;
    const slot = rotated ? (plotWidth - rotatedLabelOverhang(plan.preferHorizontal ? 120 : plan.labelWidth, rawSlot)) / Math.max(1, items.length) : rawSlot;
    showLabels = canShowBarLabels(slot, false, longestValue, 0);
    splitNumber = valueAxisSplits(height - plan.height - 60, maxValue);
    grid = { left: VALUE_AXIS_NAME_SPACE, right: 12, top: showLabels ? 26 : 12, bottom: 8, containLabel: true };
    categoryAxis = {
      type: 'category',
      data: labels,
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
      },
    };
  }
  const valueAxis = {
    type: 'value',
    minInterval: 1,
    splitNumber,
    name: valueAxisName,
    nameLocation: 'middle',
    nameGap: horizontal ? 26 : valueAxisNameGap(maxValue, tick),
    nameMoveOverlap: false,
    nameTextStyle: { color: p.muted, fontSize: 11 },
    splitLine: { lineStyle: { color: p.grid } },
    axisLabel: { color: p.muted, fontSize: 11, hideOverlap: true, formatter: (v: number) => tick(v) },
  };
  return {
    grid,
    tooltip: {
      ...baseTooltip(p),
      trigger: 'item',
      formatter: (params: { dataIndex: number }) => {
        const item = items[params.dataIndex];
        return item ? tooltipLine(item.color, item.label, item.value, total) : '';
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: [
      {
        type: 'bar',
        barMaxWidth: 22,
        data: items.map((i) => ({
          value: i.value,
          itemStyle: { color: i.color, opacity: selected && selected !== i.label ? 0.35 : 1, borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] },
        })),
        // Safety net after real layout: a value label that would still touch another is hidden (tooltip keeps it).
        labelLayout: { hideOverlap: true },
        label: {
          show: showLabels,
          position: horizontal ? 'right' : 'top',
          color: p.text,
          fontSize: 11,
          formatter: (params: { value: number }) => label(params.value),
        },
      },
    ],
  };
}

/** Whether a column chart of these labels would be readable at this width. */
export function columnsFit(labels: string[], width: number): boolean {
  return !verticalLabelPlan(labels, width - 70).preferHorizontal;
}

/** Single-series bar chart; exact counts (and shares) are always in labels or tooltips. */
export function SimpleBarChart({ items, total, orientation = 'horizontal', selected, onSelect, height, ariaLabel, valueAxisName = 'Issues', title }: Props) {
  const p = useChartPalette();
  const labels = items.map((i) => i.label);
  const isHorizontal = (width: number) => orientation === 'horizontal' || (orientation === 'auto' && !columnsFit(labels, width));
  const summary = items.map((i) => `${i.label}: ${valueText(i.value, total)}`).join('; ');
  return (
    <ChartShell
      ariaLabel={ariaLabel}
      summary={summary}
      exportTitle={title}
      exportName={title}
      height={(width) => height ?? (isHorizontal(width) ? horizontalChartHeight(items.length) : 320 + verticalLabelPlan(labels, width - 70).height)}
      build={({ width, height: h }) => buildBarOption({ items, total, horizontal: isHorizontal(width), selected, width, height: h, valueAxisName, palette: p })}
      onClick={onSelect ? (e) => onSelect(items[e.dataIndex]?.label ?? e.name) : undefined}
    />
  );
}
