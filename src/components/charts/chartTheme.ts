import { useTheme } from '@/components/common/ThemeContext';
import { escapeHtml, formatCount, formatPercent, percentOf } from '@/lib/text';

export interface ChartPalette {
  surface: string;
  text: string;
  muted: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
}

const LIGHT: ChartPalette = { surface: '#ffffff', text: '#1e293b', muted: '#64748b', grid: '#e5e7eb', tooltipBg: '#ffffff', tooltipBorder: '#e2e8f0' };
const DARK: ChartPalette = { surface: '#161d2b', text: '#e2e8f0', muted: '#94a3b8', grid: '#2a3445', tooltipBg: '#1b2333', tooltipBorder: '#334155' };

export function useChartPalette(): ChartPalette {
  return useTheme().dark ? DARK : LIGHT;
}

export function baseTooltip(p: ChartPalette) {
  return {
    backgroundColor: p.tooltipBg,
    borderColor: p.tooltipBorder,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: p.text, fontSize: 12 },
    extraCssText: 'box-shadow: 0 4px 14px rgba(0,0,0,.12); border-radius: 6px; max-width: 320px; white-space: normal;',
    confine: true,
  };
}

export function swatch(color: string): string {
  return `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:${escapeHtml(color)}"></span>`;
}

/** Tooltip line "■ Label: 12 (34.5%)" with the label HTML-escaped (labels come from the uploaded file). */
export function tooltipLine(color: string, label: string, count: number, total?: number): string {
  const pct = total !== undefined ? ` <span style="opacity:.7">(${formatPercent(percentOf(count, total))})</span>` : '';
  return `${swatch(color)}${escapeHtml(label)}: <b>${formatCount(count)}</b>${pct}`;
}

export function truncateLabel(label: string, max = 22): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}
