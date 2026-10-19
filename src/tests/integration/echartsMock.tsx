import type { ChartClick, ChartOption } from '@/components/charts/EChart';

interface MockProps {
  option: ChartOption;
  ariaLabel: string;
  onClick?: (e: ChartClick) => void;
}

interface AxisLike {
  type?: string;
  data?: string[];
}

/** jsdom cannot lay out ECharts; this stand-in exposes each chart's categories and values for assertions and clicks. */
export function EChartMock({ option, ariaLabel, onClick }: MockProps) {
  const o = option as { series?: { type: string; name?: string; data: unknown[] }[]; xAxis?: AxisLike; yAxis?: AxisLike };
  const series = o.series ?? [];
  let names: string[] = [];
  if (series[0]?.type === 'pie') names = (series[0].data as { name: string }[]).map((d) => d.name);
  else names = (o.yAxis?.type === 'category' ? o.yAxis.data : o.xAxis?.data) ?? [];
  const valueOf = (i: number) =>
    series
      .map((s) => {
        const d = s.data[i] as number | { value: number } | undefined;
        return typeof d === 'number' ? d : (d?.value ?? 0);
      })
      .reduce((a, b) => a + b, 0);
  return (
    <div role="img" aria-label={ariaLabel} data-testid="echart">
      {names.map((name, i) => (
        <button key={`${name}-${i}`} type="button" data-chart-value={valueOf(i)} onClick={() => onClick?.({ name, dataIndex: i, seriesName: series[0]?.name })}>
          {name}: {valueOf(i)}
        </button>
      ))}
    </div>
  );
}
