import { UNASSIGNED_LABEL } from '@/types/issue';
import type { AssigneeRule } from '@/types/mappings';
import { cleanText, normKey } from '@/lib/text';
import type { DistinctValue } from './statusNormalizer';

/** Placeholder values that mean "nobody" (compared case-insensitively). Users can override per value. */
export const UNASSIGNED_PLACEHOLDERS = ['unassigned', 'not assigned', 'none', 'n/a', 'na', '-', '--', 'null', 'nobody', '(unassigned)'];

export function isUnassignedPlaceholder(value: string): boolean {
  const key = normKey(value);
  return key === '' || UNASSIGNED_PLACEHOLDERS.includes(key);
}

/**
 * Default rule: trimmed value as label; blank / placeholder values are Unassigned.
 * Names are grouped case-insensitively only (no fuzzy matching between different spellings).
 */
export function defaultAssigneeRule(value: DistinctValue): AssigneeRule {
  const unassigned = isUnassignedPlaceholder(value.sourceLabel);
  return {
    key: value.key,
    sourceLabel: value.sourceLabel,
    label: unassigned ? UNASSIGNED_LABEL : cleanText(value.sourceLabel),
    unassigned,
    count: value.count,
  };
}

export function buildAssigneeRules(values: DistinctValue[], previous?: Record<string, AssigneeRule>): Record<string, AssigneeRule> {
  const rules: Record<string, AssigneeRule> = {};
  for (const value of values) {
    const prior = previous?.[value.key];
    rules[value.key] = prior ? { ...prior, sourceLabel: value.sourceLabel, count: value.count } : defaultAssigneeRule(value);
  }
  return rules;
}

/** Resolve the display name for a rule, honoring the unassigned flag. */
export function assigneeLabel(rule: AssigneeRule | undefined): { label: string; unassigned: boolean } {
  if (!rule || rule.unassigned) return { label: UNASSIGNED_LABEL, unassigned: true };
  const label = cleanText(rule.label) || UNASSIGNED_LABEL;
  return { label, unassigned: label === UNASSIGNED_LABEL };
}
