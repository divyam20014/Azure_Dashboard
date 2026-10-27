import { ChartShell } from './ChartShell';
import { baseTooltip, tooltipLine, useChartPalette, type ChartPalette } from './chartTheme';
import { legendLayout, LEGEND_ITEM_GAP } from './chartLayout';
import { formatCount, formatPercent, percentOf } from '@/lib/text';
import type { ChartOption } from './EChart';

export interface DonutItem {
  label: string;
  count: number;
  color: string;
}

interface Props {
  items: DonutItem[];
  total: number;
  selected?: string | null;
  onSelect?: (label: string) => void;
  /** Minimum height; grows when the legend needs more rows. */
  height?: number;
  ariaLabel: string;
  /** Kept for compatibility: legends now always wrap (never paged). */
  legendType?: 'scroll' | 'plain';
  /** Full ring ('donut') or filled ('pie'). */
  variant?: 'donut' | 'pie';
  title?: string;
  /** Centre caption under the total (default "issues"). */
  unit?: string;
}

const legendText = (item: DonutItem, total: number) => `${item.label}  ${formatCount(item.count)} (${formatPercent(percentOf(item.count, total))})`;

export function buildDonutOption(args: { items: DonutItem[]; total: number; selected?: string | null; selectable: boolean; width: number; height: number; palette: ChartPalette; variant: 'donut' | 'pie'; unit: string; showLegend?: boolean }): ChartOption {
  const { items, total, selected, selectable, width, height, palette: p, variant, unit } = args;
  const showLegend = args.showLegend ?? true;
  const byName = new Map(items.map((i) => [i.label, i]));
  const legend = showLegend ? legendLayout(items.map((i) => legendText(i, total)), width) : { height: 0, labelWidth: 0, rows: 0 };
  // The ring lives in the area above the legend; the centre total is drawn exactly once.
  const plotHeight = Math.max(160, height - legend.height - 8);
  const radius = Math.max(50, Math.min(width, plotHeight) / 2 - 12);
  const cy = plotHeight / 2 + 4;
  return {
    tooltip: {
      ...baseTooltip(p),
      trigger: 'item',
      formatter: (params: { name: string }) => {
        const item = byName.get(params.name);
        return item ? tooltipLine(item.color, item.label, item.count, total) : '';
      },
    },
    legend: showLegend
      ? {
          type: 'plain',
          bottom: 3,
          left: 'center',
          width: width - 12,
          icon: 'roundRect',
          itemWidth: 10,
          itemHeight: 10,
          itemGap: LEGEND_ITEM_GAP,
          padding: 0,
          textStyle: { color: p.text, fontSize: 12, width: legend.labelWidth, overflow: 'truncate', ellipsis: '…' },
          tooltip: { show: true },
          formatter: (name: string) => {
            const item = byName.get(name);
            return item ? legendText(item, total) : name;
          },
        }
      : { show: false },
    graphic:
      variant === 'donut'
        ? [
            { type: 'text', left: 'center', top: cy - 18, silent: true, style: { text: formatCount(total), fontSize: 22, fontWeight: 600, fill: p.text, textAlign: 'center' } },
            { type: 'text', left: 'center', top: cy + 8, silent: true, style: { text: unit, fontSize: 12, fill: p.muted, textAlign: 'center' } },
          ]
        : [],
    series: [
      {
        type: 'pie',
        radius: variant === 'donut' ? [Math.round(radius * 0.66), Math.round(radius)] : [0, Math.round(radius)],
        center: ['50%', cy],
        avoidLabelOverlap: true,
        selectedMode: selectable ? 'single' : false,
        selectedOffset: 6,
        itemStyle: { borderColor: p.surface, borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: true, scaleSize: 4, label: { show: false } },
        data: items.map((i) => ({ name: i.label, value: i.count, selected: selected === i.label, itemStyle: { color: i.color } })),
      },
    ],
  };
}

/** Share of issues per category. Every segment's exact count and share is in the wrapped legend. */
export function StatusDonutChart({ items, total, selected, onSelect, height = 320, ariaLabel, variant = 'donut', title, unit = 'issues' }: Props) {
  const p = useChartPalette();
  const legendHeight = (width: number) => legendLayout(items.map((i) => legendText(i, total)), width).height;
  const summary = items.map((i) => `${i.label}: ${formatCount(i.count)} (${formatPercent(percentOf(i.count, total))})`).join('; ');
  return (
    <ChartShell
      ariaLabel={ariaLabel}
      summary={summary}
      exportTitle={title}
      exportName={title}
      height={(width) => Math.max(height, 240 + legendHeight(width))}
      build={({ width, height: h }) => buildDonutOption({ items, total, selected, selectable: !!onSelect, width, height: h, palette: p, variant, unit })}
      onClick={onSelect ? (e) => onSelect(e.name) : undefined}
    />
  );
}
