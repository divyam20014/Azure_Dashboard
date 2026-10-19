import { ensureFontMeasureInfo } from 'zrender/lib/contain/text.js';

/**
 * ECharts' renderer (ZRender) caches the measured width of every label it draws —
 * status names, assignee names, legend text with counts — in a module-level LRU
 * keyed by font (capacity 100 fonts, each holding up to 500 strings). It outlives
 * the charts, so after Clear Data it would still hold text from the uploaded file.
 *
 * ZRender has no reset API, but filling the font LRU with 100 neutral placeholder
 * fonts evicts every real font entry and, with it, all cached label strings. The LRU
 * keeps the most recently evicted entry for reuse until the next insert, hence one
 * extra placeholder. Names are unique per call so repeated clears always evict.
 */
const FONT_CACHE_CAPACITY = 100;
let generation = 0;

export function releaseChartTextCache(): void {
  generation++;
  try {
    for (let i = 0; i <= FONT_CACHE_CAPACITY; i++) ensureFontMeasureInfo(`1px qa-cache-reset-${generation}-${i}`);
  } catch {
    // Text measurement unavailable (e.g. no canvas in tests): nothing was cached either.
  }
}
