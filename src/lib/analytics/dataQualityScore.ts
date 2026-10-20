import type { IssueRecord } from '@/types/issue';
import type { ColumnMapping, LogicalField, ValueMappings } from '@/types/mappings';
import { normKey } from '@/lib/text';

export type QualityDimension =
  | 'idCompleteness'
  | 'statusCompleteness'
  | 'statusMapping'
  | 'priorityCompleteness'
  | 'priorityMapping'
  | 'assigneeCompleteness'
  | 'dateValidity'
  | 'duplicateIds';

export interface DimensionDefinition {
  id: QualityDimension;
  label: string;
  /** Source fields the rule depends on; the rule is not applicable when none is mapped. */
  fields: LogicalField[];
  description: string;
}

export const QUALITY_DIMENSIONS: DimensionDefinition[] = [
  { id: 'idCompleteness', label: 'Issue ID completeness', fields: ['id'], description: 'Records with a non-blank issue ID.' },
  { id: 'statusCompleteness', label: 'Status completeness', fields: ['status'], description: 'Records with a non-blank status.' },
  { id: 'statusMapping', label: 'Status mapping coverage', fields: ['status'], description: 'Records with a status, whose status has a workflow category (Open / Closed).' },
  { id: 'priorityCompleteness', label: 'Priority completeness', fields: ['priority'], description: 'Records with a non-blank priority.' },
  { id: 'priorityMapping', label: 'Priority mapping coverage', fields: ['priority'], description: 'Records with a priority, whose value is recognized, confirmed or declared Unknown.' },
  { id: 'assigneeCompleteness', label: 'Assignee completeness', fields: ['assignee'], description: 'Records with a non-blank assignee cell.' },
  { id: 'dateValidity', label: 'Date validity', fields: ['created', 'updated', 'closed'], description: 'Records whose mapped dates are all readable and not in the future.' },
  { id: 'duplicateIds', label: 'Unique issue IDs', fields: ['id'], description: 'Records with an ID that are not a repeat of an earlier record with the same ID.' },
];

export type QualityWeights = Record<QualityDimension, number>;

export const DEFAULT_QUALITY_WEIGHTS: QualityWeights = {
  idCompleteness: 15,
  statusCompleteness: 15,
  statusMapping: 15,
  priorityCompleteness: 10,
  priorityMapping: 10,
  assigneeCompleteness: 15,
  dateValidity: 10,
  duplicateIds: 10,
};

/** A rule passes at ≥ 98 % valid records, warns at ≥ 90 %, and is an error below that. */
export const PASS_THRESHOLD = 98;
export const WARNING_THRESHOLD = 90;

export type RuleOutcome = 'pass' | 'warning' | 'error' | 'not-applicable';

export interface DimensionResult {
  id: QualityDimension;
  label: string;
  description: string;
  weight: number;
  outcome: RuleOutcome;
  /** 0–100, or null when not applicable. */
  score: number | null;
  valid: number;
  checked: number;
  /** Why the rule is not applicable, or why a required field scored zero. */
  note?: string;
}

export interface DataQualityScore {
  /** Weighted score 0–100, or null when no rule applies or there are no records. */
  overall: number | null;
  dimensions: DimensionResult[];
  passed: number;
  warnings: number;
  errors: number;
  notApplicable: number;
  recordsChecked: number;
}

function outcomeFor(score: number): RuleOutcome {
  if (score >= PASS_THRESHOLD) return 'pass';
  if (score >= WARNING_THRESHOLD) return 'warning';
  return 'error';
}

/**
 * Transparent, rule-based data-quality score over all valid records (independent of
 * filters and the duplicate rule). Each rule measures the share of records that pass;
 * rules whose fields are absent from the file are "not applicable" and excluded from
 * the weighting unless the user marked one of those fields as required, in which case
 * the rule scores 0. The overall score is the weight-averaged score of applicable rules.
 * This is a completeness/consistency indicator, not a formal quality certification.
 */
export function calculateDataQualityScore(input: {
  records: IssueRecord[];
  mapping: ColumnMapping;
  values: ValueMappings;
  weights?: Partial<QualityWeights>;
  requiredFields?: LogicalField[];
  now?: Date;
}): DataQualityScore {
  const { records, mapping, values } = input;
  const weights = { ...DEFAULT_QUALITY_WEIGHTS, ...input.weights };
  const required = new Set(input.requiredFields ?? []);
  const now = input.now ?? new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  const measure = (id: QualityDimension): { valid: number; checked: number } => {
    switch (id) {
      case 'idCompleteness':
        return { valid: records.filter((r) => r.id !== '').length, checked: records.length };
      case 'statusCompleteness':
        return { valid: records.filter((r) => r.statusRaw !== '').length, checked: records.length };
      case 'statusMapping': {
        const withStatus = records.filter((r) => r.statusRaw !== '');
        return { valid: withStatus.filter((r) => r.statusCategory !== 'unmapped').length, checked: withStatus.length };
      }
      case 'priorityCompleteness':
        return { valid: records.filter((r) => r.priorityRaw !== '').length, checked: records.length };
      case 'priorityMapping': {
        const withPriority = records.filter((r) => r.priorityRaw !== '');
        return { valid: withPriority.filter((r) => values.priority[normKey(r.priorityRaw)]?.confirmed !== false).length, checked: withPriority.length };
      }
      case 'assigneeCompleteness':
        return { valid: records.filter((r) => r.assigneeRaw !== '').length, checked: records.length };
      case 'dateValidity': {
        const ok = (r: IssueRecord) => r.invalidDates.length === 0 && [r.created, r.updated, r.closed].every((d) => d === null || d.getTime() <= endOfToday);
        return { valid: records.filter(ok).length, checked: records.length };
      }
      case 'duplicateIds': {
        const withId = records.filter((r) => r.id !== '');
        return { valid: withId.filter((r) => !r.isDuplicateId || r.isFirstOfId).length, checked: withId.length };
      }
    }
  };

  const dimensions: DimensionResult[] = QUALITY_DIMENSIONS.map((def) => {
    const weight = Math.max(0, Number(weights[def.id]) || 0);
    const base = { id: def.id, label: def.label, description: def.description, weight };
    const present = def.fields.some((f) => mapping[f] !== null);
    if (!present) {
      const requiredMissing = def.fields.some((f) => required.has(f));
      if (requiredMissing) {
        return { ...base, outcome: 'error', score: 0, valid: 0, checked: records.length, note: 'Required field is not present in the source file.' };
      }
      return { ...base, outcome: 'not-applicable', score: null, valid: 0, checked: 0, note: 'Field not present in the source file (optional).' };
    }
    const { valid, checked } = measure(def.id);
    if (checked === 0) return { ...base, outcome: 'not-applicable', score: null, valid, checked, note: 'No records to check for this rule.' };
    const score = (valid / checked) * 100;
    return { ...base, outcome: outcomeFor(score), score, valid, checked };
  });

  const applicable = dimensions.filter((d) => d.score !== null && d.weight > 0);
  const weightSum = applicable.reduce((s, d) => s + d.weight, 0);
  const overall = records.length > 0 && weightSum > 0 ? applicable.reduce((s, d) => s + d.weight * (d.score as number), 0) / weightSum : null;

  return {
    overall,
    dimensions,
    passed: dimensions.filter((d) => d.outcome === 'pass').length,
    warnings: dimensions.filter((d) => d.outcome === 'warning').length,
    errors: dimensions.filter((d) => d.outcome === 'error').length,
    notApplicable: dimensions.filter((d) => d.outcome === 'not-applicable').length,
    recordsChecked: records.length,
  };
}
