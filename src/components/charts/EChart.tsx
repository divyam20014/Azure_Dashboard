import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent, AriaComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([BarChart, PieChart, GridComponent, LegendComponent, TooltipComponent, AriaComponent, SVGRenderer]);

export type ChartOption = echarts.EChartsCoreOption;

export interface ChartClick {
  name: string;
  seriesName?: string;
  dataIndex: number;
}

interface EChartProps {
  option: ChartOption;
  height: number;
  ariaLabel: string;
  onClick?: (event: ChartClick) => void;
  className?: string;
}

/**
 * Thin ECharts wrapper. Uses the SVG renderer so charts stay sharp when printed.
 * All chart data stays in this page; ECharts makes no network requests.
 */
export function EChart({ option, height, ariaLabel, onClick, className }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chartRef.current = chart;
    chart.on('click', (params) => {
      const p = params as { name: string; seriesName?: string; dataIndex: number };
      clickRef.current?.({ name: p.name, seriesName: p.seriesName, dataIndex: p.dataIndex });
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    const onPrint = () => chart.resize();
    window.addEventListener('beforeprint', onPrint);
    return () => {
      observer.disconnect();
      window.removeEventListener('beforeprint', onPrint);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({ aria: { enabled: true }, animationDuration: 300, ...option }, { notMerge: true });
  }, [option]);

  useEffect(() => {
    chartRef.current?.resize();
  }, [height]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ height, width: '100%', minWidth: 0, overflow: 'hidden', cursor: onClick ? 'pointer' : undefined }} />;
}
