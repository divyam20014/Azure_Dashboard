import type { WorkflowCategory } from '@/types/issue';
import { NO_STATUS_LABEL } from '@/types/issue';
import type { StatusRule } from '@/types/mappings';
import { cleanText, compactKey } from '@/lib/text';

/** The five statuses that drive the KPI cards, in display order. */
export const CORE_STATUSES = ['Closed', 'New', 'Reopened', 'Ready for QA', 'Development in Progress'] as const;
export type CoreStatus = (typeof CORE_STATUSES)[number];

interface KnownStatus {
  label: string;
  /** Compact keys (lower-case alphanumerics) that map to this label. */
  aliases: string[];
  /** Applied automatically — only for the five core statuses, as specified. */
  category?: WorkflowCategory;
  /** Offered via "Apply suggestions"; never applied silently. */
  suggested?: WorkflowCategory;
}

const KNOWN_STATUSES: KnownStatus[] = [
  { label: 'Closed', aliases: ['closed'], category: 'closed' },
  { label: 'New', aliases: ['new'], category: 'open' },
  { label: 'Reopened', aliases: ['reopen', 'reopened', 'reopn'], category: 'open' },
  {
    label: 'Ready for QA',
    aliases: ['readyforqa', 'readyforqatesting', 'readyfortest', 'readyfortesting', 'readytotest', 'qaready', 'readyforqc'],
    category: 'open',
  },
  {
    label: 'Development in Progress',
    aliases: ['developmentinprogress', 'devinprogress', 'indevelopment', 'underdevelopment', 'developmentinprocess', 'devinprocess', 'developmentongoing'],
    category: 'open',
  },
  { label: 'Active', aliases: ['active'], suggested: 'open' },
  { label: 'Open', aliases: ['open'], suggested: 'open' },
  { label: 'In Progress', aliases: ['inprogress', 'wip', 'workinprogress'], suggested: 'open' },
  { label: 'To Do', aliases: ['todo'], suggested: 'open' },
  { label: 'Ready for Development', aliases: ['readyfordevelopment', 'readyfordev'], suggested: 'open' },
  { label: 'Testing', aliases: ['testing', 'intesting', 'inqa', 'qainprogress', 'undertesting'], suggested: 'open' },
  { label: 'Blocked', aliases: ['blocked'], suggested: 'open' },
  { label: 'On Hold', aliases: ['onhold', 'hold'], suggested: 'open' },
  { label: 'Pending', aliases: ['pending'], suggested: 'open' },
  { label: 'Done', aliases: ['done', 'completed', 'complete'], suggested: 'closed' },
  // Deliberately no suggestion: whether these count as closed is a team decision.
  { label: 'Resolved', aliases: ['resolved'] },
  { label: 'Removed', aliases: ['removed'] },
  { label: 'Cancelled', aliases: ['cancelled', 'canceled'] },
  { label: 'Rejected', aliases: ['rejected'] },
  { label: 'Fixed', aliases: ['fixed'] },
  { label: 'Duplicate', aliases: ['duplicate'] },
  { label: "Won't Fix", aliases: ['wontfix', 'willnotfix'] },
];

const ALIAS_INDEX = new Map<string, KnownStatus>();
for (const known of KNOWN_STATUSES) for (const alias of known.aliases) ALIAS_INDEX.set(alias, known);

export interface DistinctValue {
  key: string;
  sourceLabel: string;
  count: number;
}

/** Default rule for one distinct source status. */
export function defaultStatusRule(value: DistinctValue): StatusRule {
  if (value.key === '') {
    return { key: '', sourceLabel: '', label: NO_STATUS_LABEL, category: 'unmapped', suggestedCategory: null, count: value.count };
  }
  const known = ALIAS_INDEX.get(compactKey(value.sourceLabel));
  if (known) {
    return {
      key: value.key,
      sourceLabel: value.sourceLabel,
      label: known.label,
      category: known.category ?? 'unmapped',
      suggestedCategory: known.category ? null : (known.suggested ?? null),
      count: value.count,
    };
  }
  return {
    key: value.key,
    sourceLabel: value.sourceLabel,
    label: cleanText(value.sourceLabel),
    category: 'unmapped',
    suggestedCategory: null,
    count: value.count,
  };
}

/** Build status rules for the distinct values, keeping any edits the user already made. */
export function buildStatusRules(values: DistinctValue[], previous?: Record<string, StatusRule>): Record<string, StatusRule> {
  const rules: Record<string, StatusRule> = {};
  for (const value of values) {
    const prior = previous?.[value.key];
    rules[value.key] = prior ? { ...prior, sourceLabel: value.sourceLabel, count: value.count } : defaultStatusRule(value);
  }
  return rules;
}

export function isCoreStatus(label: string): label is CoreStatus {
  return (CORE_STATUSES as readonly string[]).includes(label);
}

export const DEFAULT_STATUS_COLORS: Record<string, string> = {
  Closed: '#16a34a',
  New: '#2563eb',
  Reopened: '#e2553f',
  'Ready for QA': '#7c3aed',
  'Development in Progress': '#d97706',
  Blocked: '#be123c',
  Active: '#0891b2',
  'In Progress': '#0d9488',
  Resolved: '#65a30d',
  Done: '#15803d',
  Testing: '#c026d3',
  'On Hold': '#a16207',
  Pending: '#0284c7',
  [NO_STATUS_LABEL]: '#64748b',
};

const EXTRA_STATUS_PALETTE = ['#0e7490', '#9333ea', '#be185d', '#4d7c0f', '#b45309', '#1d4ed8', '#047857', '#7e22ce', '#a21caf', '#0369a1'];

/** Color for each normalized status label, keeping user overrides. */
export function buildStatusColors(labels: string[], previous?: Record<string, string>): Record<string, string> {
  const colors: Record<string, string> = {};
  let extra = 0;
  for (const label of labels) {
    colors[label] = previous?.[label] ?? DEFAULT_STATUS_COLORS[label] ?? EXTRA_STATUS_PALETTE[extra++ % EXTRA_STATUS_PALETTE.length];
  }
  return colors;
}

export const UNMAPPED_COLOR = '#64748b';
export const UNASSIGNED_COLOR = '#94a3b8';
export const CATEGORY_COLORS: Record<WorkflowCategory, string> = {
  closed: '#16a34a',
  open: '#2563eb',
  unmapped: '#64748b',
};
export const CATEGORY_LABELS: Record<WorkflowCategory, string> = {
  closed: 'Closed',
  open: 'Open / Pending',
  unmapped: 'Unmapped',
};
