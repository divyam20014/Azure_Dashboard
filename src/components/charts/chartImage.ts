import type { ChartInstance } from './EChart';
import { downloadBlob } from '@/lib/export/download';
import { CHART_FONT } from './chartLayout';
import { escapeHtml, fileStem, todayStamp } from '@/lib/text';

const TITLE_BAND = 40;

/**
 * Compose a standalone SVG of the rendered chart with its title above the plot, on a
 * solid background. Built entirely in memory from the chart's own SVG output.
 */
export function chartSvg(chart: ChartInstance, title: string, background = '#ffffff', textColor = '#0f172a'): { svg: string; width: number; height: number } {
  const inner = (chart as unknown as { renderToSVGString: () => string }).renderToSVGString();
  const width = chart.getWidth();
  const height = chart.getHeight() + TITLE_BAND;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    `<text x="12" y="26" font-family="${CHART_FONT}" font-size="16" font-weight="600" fill="${textColor}">${escapeHtml(title)}</text>` +
    `<g transform="translate(0 ${TITLE_BAND})">${inner}</g>` +
    `</svg>`;
  return { svg, width, height };
}

/** Download the chart as SVG, or rasterize that SVG locally into a 2× PNG. Nothing leaves the browser. */
export async function exportChartImage(chart: ChartInstance, format: 'png' | 'svg', title: string, name: string): Promise<void> {
  const dark = document.documentElement.classList.contains('dark');
  const { svg, width, height } = chartSvg(chart, title, dark ? '#161d2b' : '#ffffff', dark ? '#e2e8f0' : '#0f172a');
  const fileName = `${fileStem(name)}-${todayStamp()}.${format}`;
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'svg') {
    downloadBlob(svgBlob, fileName);
    return;
  }
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Chart image could not be rendered.'));
      img.src = url;
    });
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed.'))), 'image/png'));
    downloadBlob(png, fileName);
  } finally {
    URL.revokeObjectURL(url);
  }
}
