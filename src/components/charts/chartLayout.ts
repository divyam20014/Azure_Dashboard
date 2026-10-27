/**
 * Shared, pure layout rules for every chart. They size legends, axes and labels from the
 * real container width so text never collides, gets clipped, or covers plotted data.
 */

export const FONT_SIZE = 12;
/**
 * One font for measuring and drawing; ECharts would otherwise use its default (wider) `sans-serif`.
 * Single quotes only: ECharts writes it unescaped into a double-quoted SVG style attribute.
 */
export const CHART_FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
/** Line height of wrapped labels; matches the 12px glyph box so wrapped lines never touch. */
export const LABEL_LINE_HEIGHT = 16;
const AVG_CHAR = 0.6; // fallback average glyph width / font size

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Pixel width of a single-line label. Uses a private canvas when available (no text is retained). */
export function textWidth(text: string, fontSize = FONT_SIZE): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? (document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D | null) : null;
    } catch {
      measureCtx = null;
    }
  }
  if (measureCtx && typeof measureCtx.measureText === 'function') {
    measureCtx.font = `${fontSize}px ${CHART_FONT}`;
    const w = measureCtx.measureText(text).width;
    if (Number.isFinite(w) && w > 0) return w;
  }
  return text.length * fontSize * AVG_CHAR;
}

export function maxTextWidth(texts: string[], fontSize = FONT_SIZE): number {
  return texts.reduce((m, t) => Math.max(m, textWidth(t, fontSize)), 0);
}

/** Compact axis numbers (1.2K, 3.4M); tooltips and tables keep exact values. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${trim(value / 1e6)}M`;
  if (abs >= 1e4) return `${trim(value / 1e3)}K`;
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}

const LEGEND_ICON = 10;
const LEGEND_ICON_GAP = 5;
/** ECharts uses itemGap both between items and between wrapped rows. */
export const LEGEND_ITEM_GAP = 12;
// Rounding and font-hinting headroom so the predicted rows never fall short of the drawn ones.
const LEGEND_ITEM_SLACK = 4;
/** Height of one legend line (12px text box). */
const LEGEND_LINE = 16;
/** Longest legend label shown in full; longer ones are truncated (the tooltip has the full name). */
export const LEGEND_LABEL_MAX = 180;

export interface LegendLayout {
  rows: number;
  height: number;
  /** Max label width given to each legend item. */
  labelWidth: number;
}

/**
 * Wrapped (never paged) legend: how many rows the items need at this width.
 * The plot area is then offset by `height`, so the legend can never cover data.
 */
export function legendLayout(names: string[], width: number): LegendLayout {
  if (names.length === 0) return { rows: 0, height: 0, labelWidth: LEGEND_LABEL_MAX };
  const usable = Math.max(120, width - 8);
  const labelWidth = Math.min(LEGEND_LABEL_MAX, usable - LEGEND_ICON - LEGEND_ICON_GAP);
  let rows = 1;
  let line = 0;
  for (const n of names) {
    const item = LEGEND_ICON + LEGEND_ICON_GAP + Math.min(labelWidth, textWidth(n)) + LEGEND_ITEM_GAP + LEGEND_ITEM_SLACK;
    if (line > 0 && line + item > usable) {
      rows++;
      line = 0;
    }
    line += item;
  }
  // Legends are drawn with padding 0, so this is the exact box height plus a small margin.
  return { rows, height: rows * LEGEND_LINE + (rows - 1) * LEGEND_ITEM_GAP + 6, labelWidth };
}

/** grid.left of a chart whose vertical value axis carries a rotated name: room for the name itself. */
export const VALUE_AXIS_NAME_SPACE = 24;

/**
 * Gap between a vertical value axis and its rotated name, sized from the widest tick label
 * (ticks run a little past the data maximum), so the name never covers ticks or leaves the chart.
 */
export function valueAxisNameGap(maxValue: number, formatTick: (v: number) => string = compactNumber): number {
  // Ticks are round numbers, so the widest one is near the top of the axis. Never measure the raw
  // maximum (e.g. 31.914893…%): that text is not drawn and would push the name off the chart.
  const top = maxValue <= 0 ? 1 : Math.ceil(maxValue * 1.25);
  // ECharts' 8px label margin + 6px clearance; with grid.left = VALUE_AXIS_NAME_SPACE the name stays inside.
  // Value axes set nameMoveOverlap: false so ECharts 6 never pushes the name further out on its own.
  return Math.ceil(Math.max(textWidth(formatTick(top), 11), textWidth(formatTick(Math.max(1, Math.round(maxValue))), 11))) + 14;
}

/**
 * Horizontal space the first rotated (35°) category label box hangs out to the left of its column.
 * ECharts sizes the box from axisLabel.width (not the text), and containLabel takes this from the plot.
 */
export function rotatedLabelOverhang(labelBoxWidth: number, slot: number): number {
  return Math.max(0, labelBoxWidth * Math.cos((35 * Math.PI) / 180) - slot / 2);
}

/** Number of value-axis intervals that fit without tick labels colliding. */
export function valueAxisSplits(axisLength: number, maxValue: number): number {
  const labelPx = textWidth(compactNumber(maxValue)) + 18;
  return Math.max(2, Math.min(5, Math.floor(axisLength / Math.max(labelPx, 56))));
}

/** Width reserved for category labels on a horizontal (y-category) axis. */
export function categoryAxisWidth(labels: string[], containerWidth: number, maxFraction = 0.38): { width: number; truncates: boolean } {
  const needed = maxTextWidth(labels) + 6;
  const cap = Math.max(70, Math.floor(containerWidth * maxFraction));
  return { width: Math.min(needed, cap), truncates: needed > cap };
}

/** Narrowest column slot whose 35°-rotated labels cannot touch: 30 · sin 35° ≈ 17px > 16px line box. */
export const ROTATED_MIN_SLOT = 30;

export interface VerticalLabelPlan {
  /** Labels cannot be shown readably under the columns: draw horizontal bars instead. */
  preferHorizontal: boolean;
  rotate: 0 | 35;
  /** Allow wrapping onto two lines. */
  wrap: boolean;
  labelWidth: number;
  /** Extra bottom space the labels need. */
  height: number;
}

/**
 * Decide how x-axis labels of a column chart fit: as-is, wrapped onto two lines, rotated
 * 35°, or not at all (switch to horizontal bars). Rotation is used only when needed.
 */
export function verticalLabelPlan(labels: string[], plotWidth: number): VerticalLabelPlan {
  const n = Math.max(1, labels.length);
  const slot = plotWidth / n;
  const widest = maxTextWidth(labels);
  if (widest + 8 <= slot) return { preferHorizontal: false, rotate: 0, wrap: false, labelWidth: slot - 4, height: 22 };
  const twoLines = labels.every((l) => wrapLines(l, slot - 6) <= 2);
  if (slot >= 48 && twoLines) return { preferHorizontal: false, rotate: 0, wrap: true, labelWidth: slot - 6, height: 2 * LABEL_LINE_HEIGHT + 10 };
  // Parallel 35° labels are slot·sin35° apart; ≥ 30px keeps that above the 16px line box.
  // They also stay readable only up to ~130px long.
  // containLabel narrows the plot by the first rotated label's overhang; decide with the slot actually drawn.
  // ECharts sizes each rotated label box from axisLabel.width, so that width is the widest real label.
  const rotatedWidth = Math.min(130, Math.ceil(widest) + 4);
  const rotatedSlot = (plotWidth - rotatedLabelOverhang(rotatedWidth, slot)) / n;
  if (rotatedSlot >= ROTATED_MIN_SLOT && widest <= 130) return { preferHorizontal: false, rotate: 35, wrap: false, labelWidth: rotatedWidth, height: Math.ceil(widest * Math.sin((35 * Math.PI) / 180)) + 26 };
  return { preferHorizontal: true, rotate: 0, wrap: false, labelWidth: 0, height: 0 };
}

/** Lines a label needs when wrapped at word boundaries to `width`. */
export function wrapLines(label: string, width: number): number {
  const words = label.split(/\s+/);
  let lines = 1;
  let line = 0;
  for (const w of words) {
    const ww = textWidth(w);
    if (ww > width) return 99;
    const add = line === 0 ? ww : ww + textWidth(' ');
    if (line + add > width) {
      lines++;
      line = ww;
    } else line += add;
  }
  return lines;
}

/** Permanent value labels only when every bar has room for one; otherwise values live in tooltips. */
export function canShowBarLabels(bandPx: number, horizontal: boolean, longestValueLabel: string, spareEndPx: number): boolean {
  if (horizontal) return bandPx >= 14 && textWidth(longestValueLabel, 11) + 6 <= spareEndPx;
  return bandPx >= textWidth(longestValueLabel, 11) + 4;
}

/** Height that gives each horizontal category a readable band. */
export function horizontalChartHeight(categories: number, extra = 0): number {
  return Math.max(200, categories * 28 + 56 + extra);
}
