import { useMemo } from 'react';
import { EChart } from './EChart';
import { baseTooltip, tooltipLine, useChartPalette } from './chartTheme';
import { formatCount, formatPercent, percentOf } from '@/lib/text';

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
  height?: number;
  ariaLabel: string;
  /** 'plain' wraps every legend entry (for print); 'scroll' pages them (for screens). */
  legendType?: 'scroll' | 'plain';
}

/** Share of issues per category. Every segment is labelled in the legend with its exact count and percentage. */
export function StatusDonutChart({ items, total, selected, onSelect, height = 320, ariaLabel, legendType = 'scroll' }: Props) {
  const p = useChartPalette();
  const option = useMemo(() => {
    const byName = new Map(items.map((i) => [i.label, i]));
    return {
      tooltip: {
        ...baseTooltip(p),
        trigger: 'item',
        formatter: (params: { name: string }) => {
          const item = byName.get(params.name);
          return item ? tooltipLine(item.color, item.label, item.count, total) : '';
        },
      },
      legend: {
        type: legendType,
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: p.text, fontSize: 12 },
        pageTextStyle: { color: p.muted },
        formatter: (name: string) => {
          const item = byName.get(name);
          return item ? `${name}  ${formatCount(item.count)} (${formatPercent(percentOf(item.count, total))})` : name;
        },
      },
      series: [
        {
          type: 'pie',
          radius: legendType === 'plain' ? ['38%', '58%'] : ['50%', '74%'],
          center: ['50%', legendType === 'plain' ? '36%' : '42%'],
          avoidLabelOverlap: true,
          selectedMode: onSelect ? 'single' : false,
          selectedOffset: 6,
          itemStyle: { borderColor: p.surface, borderWidth: 2 },
          label: {
            show: true,
            position: 'center',
            formatter: () => `{v|${formatCount(total)}}\n{l|issues}`,
            rich: { v: { fontSize: 22, fontWeight: 600, color: p.text, lineHeight: 28 }, l: { fontSize: 12, color: p.muted } },
          },
          emphasis: { scale: true, scaleSize: 4, label: { show: true } },
          labelLine: { show: false },
          data: items.map((i) => ({ name: i.label, value: i.count, selected: selected === i.label, itemStyle: { color: i.color } })),
        },
      ],
    };
  }, [items, total, selected, onSelect, p, legendType]);

  return <EChart option={option} height={height} ariaLabel={ariaLabel} onClick={onSelect ? (e) => onSelect(e.name) : undefined} />;
}
