import { useMemo } from 'react';
import { EChart } from './EChart';
import { baseTooltip, tooltipLine, useChartPalette } from './chartTheme';
import { escapeHtml, formatCount } from '@/lib/text';

export interface StackSeries {
  name: string;
  color: string;
  values: number[];
}

interface Props {
  categories: string[];
  series: StackSeries[];
  orientation?: 'horizontal' | 'vertical';
  onSelect?: (category: string, seriesName: string) => void;
  height?: number;
  ariaLabel: string;
  /** Append each category's total to its axis label. */
  showTotals?: boolean;
  labelWidth?: number;
}

export function stackedChartHeight(count: number): number {
  return Math.max(180, count * 30 + 70);
}

/**
 * Stacked bars with a legend (identity never by colour alone) and an axis tooltip
 * listing every non-zero segment with its exact count and the category total.
 */
export function StackedBarChart({ categories, series, orientation = 'horizontal', onSelect, height, ariaLabel, showTotals = true, labelWidth = 150 }: Props) {
  const p = useChartPalette();
  const horizontal = orientation === 'horizontal';
  const option = useMemo(() => {
    const totals = categories.map((_, ci) => series.reduce((sum, s) => sum + (s.values[ci] ?? 0), 0));
    const index = new Map(categories.map((c, i) => [c, i]));
    const category = {
      type: 'category',
      data: categories,
      inverse: horizontal,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.grid } },
      axisLabel: {
        color: p.text,
        fontSize: 12,
        width: horizontal ? labelWidth : undefined,
        overflow: 'truncate',
        interval: 0,
        formatter: (v: string) => {
          const i = index.get(v);
          return showTotals && i !== undefined ? `${v} (${formatCount(totals[i])})` : v;
        },
      },
    };
    const value = { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: p.grid } }, axisLabel: { color: p.muted, fontSize: 11 } };
    return {
      grid: { left: 8, right: 24, top: 40, bottom: 8, containLabel: true },
      legend: {
        type: 'scroll',
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: p.text, fontSize: 12 },
        pageTextStyle: { color: p.muted },
      },
      tooltip: {
        ...baseTooltip(p),
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: { dataIndex: number }[]) => {
          const ci = params[0]?.dataIndex ?? 0;
          const lines = series.filter((s) => (s.values[ci] ?? 0) > 0).map((s) => tooltipLine(s.color, s.name, s.values[ci], totals[ci]));
          return `<b>${escapeHtml(categories[ci] ?? '')}</b> — ${formatCount(totals[ci] ?? 0)} total<br/>${lines.join('<br/>') || 'No issues'}`;
        },
      },
      xAxis: horizontal ? value : category,
      yAxis: horizontal ? category : value,
      series: series.map((s) => ({
        type: 'bar',
        name: s.name,
        stack: 'total',
        barMaxWidth: 22,
        itemStyle: { color: s.color, borderColor: p.surface, borderWidth: 1 },
        emphasis: { focus: 'series' },
        data: s.values,
      })),
    };
  }, [categories, series, horizontal, p, showTotals, labelWidth]);

  return (
    <EChart
      option={option}
      height={height ?? (horizontal ? stackedChartHeight(categories.length) : 320)}
      ariaLabel={ariaLabel}
      onClick={onSelect ? (e) => onSelect(categories[e.dataIndex] ?? e.name, e.seriesName ?? '') : undefined}
    />
  );
}
