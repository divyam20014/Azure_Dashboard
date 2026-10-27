import { useEffect, useId, useRef } from 'react';
import { CHART_FONT } from './chartLayout';
import * as echarts from 'echarts/core';
import { LabelLayout } from 'echarts/features';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { AriaComponent, GraphicComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

// LabelLayout powers series labelLayout.hideOverlap (value labels never drawn on top of each other).
echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, AriaComponent, GraphicComponent, LabelLayout, SVGRenderer]);

export type ChartOption = echarts.EChartsCoreOption;
export type ChartInstance = echarts.ECharts;

export interface ChartClick {
  name: string;
  seriesName?: string;
  dataIndex: number;
  seriesIndex?: number;
}

interface EChartProps {
  option: ChartOption;
  height: number;
  ariaLabel: string;
  onClick?: (event: ChartClick) => void;
  className?: string;
  /** Text alternative read by screen readers (exact values of the chart). */
  summary?: string;
  /** Receives the live instance (or null on dispose), e.g. for image export. */
  onInstance?: (chart: ChartInstance | null) => void;
}

/**
 * Thin ECharts wrapper (SVG renderer, sharp in print). The chart is created only once its
 * container has a real size, so it never initialises at zero width (e.g. inside a collapsed
 * section) and it re-measures on every container resize. All data stays in this page.
 */
export function EChart({ option, height, ariaLabel, onClick, className, summary, onInstance }: EChartProps) {
  const summaryId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const optionRef = useRef(option);
  optionRef.current = option;
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const instanceRef = useRef(onInstance);
  instanceRef.current = onInstance;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (chart: echarts.ECharts) => chart.setOption({ aria: { enabled: true }, animationDuration: 300, textStyle: { fontFamily: CHART_FONT }, ...optionRef.current }, { notMerge: true });
    const ensure = () => {
      if (chartRef.current) {
        chartRef.current.resize();
        return;
      }
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      const chart = echarts.init(el, undefined, { renderer: 'svg' });
      chartRef.current = chart;
      chart.on('click', (params) => {
        const p = params as { name: string; seriesName?: string; dataIndex: number; seriesIndex?: number };
        clickRef.current?.({ name: p.name, seriesName: p.seriesName, dataIndex: p.dataIndex, seriesIndex: p.seriesIndex });
      });
      apply(chart);
      instanceRef.current?.(chart);
    };
    ensure();
    const observer = new ResizeObserver(ensure);
    observer.observe(el);
    window.addEventListener('beforeprint', ensure);
    return () => {
      observer.disconnect();
      window.removeEventListener('beforeprint', ensure);
      instanceRef.current?.(null);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({ aria: { enabled: true }, animationDuration: 300, textStyle: { fontFamily: CHART_FONT }, ...option }, { notMerge: true });
  }, [option]);

  useEffect(() => {
    chartRef.current?.resize();
  }, [height]);

  return (
    <>
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={summary ? summaryId : undefined}
        className={className}
        style={{ height, width: '100%', minWidth: 0, overflow: 'hidden', cursor: onClick ? 'pointer' : undefined }}
      />
      {summary && (
        <p id={summaryId} className="sr-only">
          {summary}
        </p>
      )}
    </>
  );
}
