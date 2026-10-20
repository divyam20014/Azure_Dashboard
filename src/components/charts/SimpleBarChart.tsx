import { useMemo } from 'react';
import { EChart } from './EChart';
import { baseTooltip, tooltipLine, truncateLabel, useChartPalette } from './chartTheme';
import { formatCount, formatPercent, percentOf } from '@/lib/text';

export interface BarItem {
  label: string;
  value: number;
  color: string;
}

interface Props {
  items: BarItem[];
  /** When given, bar labels and tooltips also show the share of this total. */
  total?: number;
  orientation?: 'horizontal' | 'vertical';
  selected?: string | null;
  onSelect?: (label: string) => void;
  height?: number;
  ariaLabel: string;
  labelWidth?: number;
  /** Title of the value axis (default "Issues"). */
  valueAxisName?: string;
}

export function barChartHeight(count: number): number {
  return Math.max(140, count * 30 + 30);
}

/** Single-series bar chart; each bar is labelled with its exact count (and share). */
export function SimpleBarChart({ items, total, orientation = 'horizontal', selected, onSelect, height, ariaLabel, labelWidth = 150, valueAxisName = 'Issues' }: Props) {
  const p = useChartPalette();
  const horizontal = orientation === 'horizontal';
  const option = useMemo(() => {
    const category = {
      type: 'category',
      data: items.map((i) => i.label),
      inverse: horizontal,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.grid } },
      axisLabel: {
        color: p.text,
        fontSize: 12,
        width: horizontal ? labelWidth : undefined,
        overflow: 'truncate',
        interval: 0,
        rotate: !horizontal && items.length > 5 ? 25 : 0,
        formatter: (v: string) => (horizontal ? v : truncateLabel(v, 16)),
      },
    };
    const value = {
      type: 'value',
      minInterval: 1,
      name: valueAxisName,
      nameLocation: 'middle',
      nameGap: horizontal ? 24 : 36,
      nameTextStyle: { color: p.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: p.grid } },
      axisLabel: { color: p.muted, fontSize: 11 },
    };
    return {
      grid: horizontal ? { left: 8, right: 80, top: 8, bottom: 22, containLabel: true } : { left: 22, right: 8, top: 28, bottom: 8, containLabel: true },
      tooltip: {
        ...baseTooltip(p),
        trigger: 'item',
        formatter: (params: { dataIndex: number }) => {
          const item = items[params.dataIndex];
          return item ? tooltipLine(item.color, item.label, item.value, total) : '';
        },
      },
      xAxis: horizontal ? value : category,
      yAxis: horizontal ? category : value,
      series: [
        {
          type: 'bar',
          barMaxWidth: 22,
          data: items.map((i) => ({
            value: i.value,
            itemStyle: {
              color: i.color,
              opacity: selected && selected !== i.label ? 0.35 : 1,
              borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
            },
          })),
          label: {
            show: true,
            position: horizontal ? 'right' : 'top',
            color: p.text,
            fontSize: 11,
            formatter: (params: { value: number }) =>
              total !== undefined ? `${formatCount(params.value)} (${formatPercent(percentOf(params.value, total))})` : formatCount(params.value),
          },
        },
      ],
    };
  }, [items, total, horizontal, selected, p, labelWidth, valueAxisName]);
  const summary = items.map((i) => `${i.label}: ${formatCount(i.value)}${total !== undefined ? ` (${formatPercent(percentOf(i.value, total))})` : ''}`).join('; ');

  return (
    <EChart
      option={option}
      height={height ?? (horizontal ? barChartHeight(items.length) : 300)}
      ariaLabel={ariaLabel}
      summary={summary}
      onClick={onSelect ? (e) => onSelect(items[e.dataIndex]?.label ?? e.name) : undefined}
    />
  );
}
