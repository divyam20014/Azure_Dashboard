import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Download, Maximize2, Minimize2 } from 'lucide-react';
import { EChart, type ChartClick, type ChartInstance, type ChartOption } from './EChart';
import { exportChartImage } from './chartImage';
import { useToast } from '@/components/common/Toast';
import { cn } from '@/lib/utils';

export interface ChartSize {
  width: number;
  height: number;
  /** True while the chart is shown full screen. */
  expanded: boolean;
}

interface Props {
  /** Builds the option for the measured size. */
  build: (size: ChartSize) => ChartOption;
  /** Inline height, fixed or derived from the measured width. */
  height: number | ((width: number) => number);
  ariaLabel: string;
  summary?: string;
  onClick?: (e: ChartClick) => void;
  /** Title written into exported images; enables the toolbar. */
  exportTitle?: string;
  /** File-name stem for image downloads. */
  exportName?: string;
  className?: string;
  footer?: ReactNode;
}

/** Width of an element, tracked with ResizeObserver (0 until laid out). */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.round(el.getBoundingClientRect().width));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const FALLBACK_WIDTH = 640;

/**
 * Shared frame for every ECharts chart: measures the container, sizes the chart for it,
 * and offers full-screen view plus local PNG / SVG download. The toolbar sits in its own
 * row above the plot so it can never cover data.
 */
export function ChartShell({ build, height, ariaLabel, summary, onClick, exportTitle, exportName, className, footer }: Props) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const [expanded, setExpanded] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);
  const instance = useRef<ChartInstance | null>(null);
  const notify = useToast();
  const width = measured || FALLBACK_WIDTH;
  const inlineHeight = typeof height === 'function' ? height(width) : height;
  const chartHeight = expanded ? Math.max(inlineHeight, viewportHeight - 72) : inlineHeight;
  const option = build({ width, height: chartHeight, expanded });
  const canFullscreen = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  useEffect(() => {
    const onChange = () => {
      setExpanded(document.fullscreenElement === ref.current);
      setViewportHeight(window.innerHeight);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [ref]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.();
  }, [ref]);

  const download = async (format: 'png' | 'svg') => {
    if (!instance.current) return;
    try {
      await exportChartImage(instance.current, format, exportTitle ?? ariaLabel, exportName ?? 'chart');
    } catch {
      notify('The chart image could not be created in this browser.', 'warning');
    }
  };

  return (
    <div ref={ref} className={cn('min-w-0', expanded && 'overflow-auto bg-card p-4', className)}>
      {exportTitle && (
        <div className="no-print mb-1 flex items-center justify-end gap-1" role="toolbar" aria-label={`${exportTitle} chart tools`}>
          {expanded && <span className="mr-auto text-sm font-semibold">{exportTitle}</span>}
          <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => download('png')} aria-label={`Download ${exportTitle} as PNG`}>
            <Download className="h-3 w-3" aria-hidden /> PNG
          </button>
          <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={() => download('svg')} aria-label={`Download ${exportTitle} as SVG`}>
            <Download className="h-3 w-3" aria-hidden /> SVG
          </button>
          {canFullscreen && (
            <button type="button" className="inline-flex items-center rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" onClick={toggleFullscreen} aria-label={expanded ? 'Exit full screen' : `Show ${exportTitle} full screen`}>
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      )}
      <EChart option={option} height={chartHeight} ariaLabel={ariaLabel} summary={summary} onClick={onClick} onInstance={(c) => (instance.current = c)} />
      {footer}
    </div>
  );
}
