import { NO_PRIORITY_LABEL, UNKNOWN_PRIORITY_LABEL } from '@/types/issue';
import type { PriorityRule } from '@/types/mappings';
import { cleanText, compactKey } from '@/lib/text';
import type { DistinctValue } from './statusNormalizer';

/** Word-based priority labels in conventional highest-to-lowest order. */
const WORD_PRIORITIES = ['Blocker', 'Critical', 'Urgent', 'Highest', 'High', 'Major', 'Medium', 'Normal', 'Moderate', 'Minor', 'Low', 'Lowest', 'Trivial'];
const WORD_INDEX = new Map(WORD_PRIORITIES.map((w, i) => [w.toLowerCase(), i]));
const WORD_ALIASES: Record<string, string> = { med: 'Medium', crit: 'Critical' };

interface Recognized {
  label: string;
  numeric: boolean;
}

/** Recognize common priority notations. Returns null for custom/unknown values. */
export function recognizePriority(raw: string): Recognized | null {
  const text = cleanText(raw).toLowerCase();
  if (!text) return null;
  let m = /^p\s*-?\s*(\d{1,2})$/.exec(text);
  if (m) return { label: `P${Number(m[1])}`, numeric: false };
  m = /^(?:priority|prio|pri)\s*[:#-]?\s*(\d{1,2})$/.exec(text);
  if (m) return { label: `P${Number(m[1])}`, numeric: false };
  // "1 - Critical", "2: High", "P1 - Critical"
  m = /^p?\s*(\d{1,2})\s*[-–:.)]\s*[a-z].*$/.exec(text);
  if (m) return { label: `P${Number(m[1])}`, numeric: false };
  m = /^(\d{1,2})(?:\.0+)?$/.exec(text);
  if (m) return { label: `P${Number(m[1])}`, numeric: true };
  const compact = compactKey(text);
  if (WORD_INDEX.has(compact)) {
    const word = WORD_PRIORITIES[WORD_INDEX.get(compact)!];
    return { label: word, numeric: false };
  }
  if (WORD_ALIASES[compact]) return { label: WORD_ALIASES[compact], numeric: false };
  return null;
}

/** Source values that, by default, mean the priority is explicitly unknown. Users can change this per value. */
export const UNKNOWN_PRIORITY_VALUES = ['unknown', 'tbd', 'to be decided', 'to be determined', 'not set', 'unset', 'n/a', 'na', 'none', '-', '--', '?', 'unprioritized', 'not prioritized'];

export function defaultPriorityRule(value: DistinctValue): PriorityRule {
  if (value.key === '') {
    return { key: '', sourceLabel: '', label: NO_PRIORITY_LABEL, confirmed: true, numeric: false, count: value.count };
  }
  if (UNKNOWN_PRIORITY_VALUES.includes(value.key)) {
    return { key: value.key, sourceLabel: value.sourceLabel, label: UNKNOWN_PRIORITY_LABEL, confirmed: true, numeric: false, unknown: true, count: value.count };
  }
  const recognized = recognizePriority(value.sourceLabel);
  if (recognized) {
    return { key: value.key, sourceLabel: value.sourceLabel, label: recognized.label, confirmed: true, numeric: recognized.numeric, count: value.count };
  }
  return { key: value.key, sourceLabel: value.sourceLabel, label: cleanText(value.sourceLabel), confirmed: false, numeric: false, count: value.count };
}

export function buildPriorityRules(values: DistinctValue[], previous?: Record<string, PriorityRule>): Record<string, PriorityRule> {
  const rules: Record<string, PriorityRule> = {};
  for (const value of values) {
    const prior = previous?.[value.key];
    rules[value.key] = prior ? { ...prior, sourceLabel: value.sourceLabel, count: value.count } : defaultPriorityRule(value);
  }
  return rules;
}

/** Sort weight for the default order: P-levels, then word levels, then custom (alphabetical), then blank. */
function defaultWeight(label: string): [number, number, string] {
  if (label === NO_PRIORITY_LABEL) return [4, 0, label];
  if (label === UNKNOWN_PRIORITY_LABEL) return [3, 0, label];
  const p = /^P(\d+)$/.exec(label);
  if (p) return [0, Number(p[1]), label];
  const w = WORD_INDEX.get(label.toLowerCase());
  if (w !== undefined) return [1, w, label];
  return [2, 0, label.toLowerCase()];
}

export function defaultPriorityOrder(labels: string[]): string[] {
  return [...new Set(labels)].sort((a, b) => {
    const wa = defaultWeight(a);
    const wb = defaultWeight(b);
    return wa[0] - wb[0] || wa[1] - wb[1] || wa[2].localeCompare(wb[2]);
  });
}

/**
 * Keep the user's order for labels that still exist and slot new labels in by default order.
 * The blank-priority bucket always stays last.
 */
export function mergePriorityOrder(labels: string[], previous?: string[]): string[] {
  const present = new Set(labels);
  if (!previous || previous.length === 0) return defaultPriorityOrder(labels);
  const kept = previous.filter((l) => present.has(l) && l !== NO_PRIORITY_LABEL);
  const missing = defaultPriorityOrder(labels.filter((l) => !kept.includes(l) && l !== NO_PRIORITY_LABEL));
  const merged = [...kept, ...missing];
  if (present.has(NO_PRIORITY_LABEL)) merged.push(NO_PRIORITY_LABEL);
  return merged;
}

/**
 * Default high-priority group: P1/P2 when present, otherwise the top word-based
 * levels. Empty when no convention is recognizable — the user then chooses.
 */
export function defaultHighPriority(order: string[]): string[] {
  const pLevels = order.filter((l) => l === 'P1' || l === 'P2');
  if (pLevels.length > 0) return pLevels;
  const words = order.filter((l) => ['blocker', 'critical', 'urgent', 'highest', 'high'].includes(l.toLowerCase()));
  return words;
}

/**
 * Priority colors follow the configured priority order (validated for colour-vision
 * deficiency in this order). They are computed from the full order, so filtering
 * never repaints a priority.
 */
const PRIORITY_PALETTE = ['#d03b3b', '#c98500', '#2a78d6', '#1baf7a', '#6250d6', '#e87ba4', '#008300', '#eb6834'];
const NO_PRIORITY_COLOR = '#94a3b8';

export function priorityColors(order: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  let i = 0;
  for (const label of order) {
    colors[label] = label === NO_PRIORITY_LABEL ? NO_PRIORITY_COLOR : PRIORITY_PALETTE[i++ % PRIORITY_PALETTE.length];
  }
  return colors;
}
