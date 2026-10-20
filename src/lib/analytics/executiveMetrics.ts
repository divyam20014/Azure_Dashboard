import type { Aggregates } from '@/types/analytics';
import type { ColumnMapping, ValueMappings } from '@/types/mappings';
import { percentOf } from '@/lib/text';
import { isCoreStatus } from '@/lib/normalization/statusNormalizer';

/**
 * Dataset scopes, from widest to narrowest. Every KPI states which scope it uses.
 *   imported  – data rows below the header in the file (blank rows included)
 *   valid     – non-blank rows, normalized into records
 *   included  – records left after the duplicate-handling rule ("analytics scope")
 *   inScope   – included records that match the global dashboard filters
 * The issue register additionally applies chart/KPI selections and search.
 */
export interface DatasetScopes {
  imported: number;
  blankRows: number;
  valid: number;
  included: number;
  /** valid − included: records left out by the duplicate-handling rule. */
  excluded: number;
  inScope: number;
  filtered: boolean;
}

export interface CountMetric {
  count: number;
  /** Share of the in-scope total; null when the total is zero. */
  percent: number | null;
}

export interface ExecutiveMetrics {
  scopes: DatasetScopes;
  statusMapped: boolean;
  priorityMapped: boolean;
  assigneeMapped: boolean;
  closed: CountMetric & { statuses: string[]; configured: boolean };
  closureRate: {
    percent: number | null;
    configured: boolean;
    /** True while some in-scope records still have unmapped statuses. */
    provisional: boolean;
    unmapped: number;
  };
  openBacklog: CountMetric & { statuses: string[]; configured: boolean };
  highPriorityOpen: CountMetric & {
    levels: { label: string; count: number }[];
    group: string[];
    configured: boolean;
    /** Bare numbers were read as P-levels (1 → P1); the convention should be confirmed. */
    numericConvention: boolean;
  };
  reopened: CountMetric & { mapped: boolean };
  readyForQa: CountMetric & { mapped: boolean };
  unassigned: CountMetric;
  blocked: CountMetric & { mapped: boolean };
  unmappedStatus: CountMetric & { values: string[] };
  /** Remaining workflow stages, kept for the compact workflow snapshot. */
  newIssues: CountMetric;
  devInProgress: CountMetric;
  otherStatuses: CountMetric & { statuses: string[] };
}

function metric(count: number, total: number): CountMetric {
  return { count, percent: percentOf(count, total) };
}

function labelsMapped(values: ValueMappings, label: string): boolean {
  return Object.values(values.status).some((r) => r.label === label);
}

/**
 * All executive KPIs from one aggregate pass. Workflow categories come only from the
 * user's confirmed status classification; nothing unmapped is counted as open or closed.
 */
export function calculateExecutiveMetrics(input: { agg: Aggregates; values: ValueMappings; mapping: ColumnMapping; scopes: DatasetScopes }): ExecutiveMetrics {
  const { agg, values, mapping, scopes } = input;
  const total = agg.total;
  const rules = Object.values(values.status);
  const closedStatuses = [...new Set(rules.filter((r) => r.category === 'closed').map((r) => r.label))];
  const openStatuses = [...new Set(rules.filter((r) => r.category === 'open').map((r) => r.label))];
  const status = (label: string) => agg.statusMap[label] ?? 0;

  const group = values.highPriority.filter((l) => values.priorityOrder.includes(l));
  const levels = group.map((label) => ({ label, count: agg.priorityCategory[label]?.open ?? 0 }));
  const hpCount = levels.reduce((s, l) => s + l.count, 0);
  const groupKeys = new Set(group);
  const numericConvention = Object.values(values.priority).some((r) => r.numeric && groupKeys.has(r.label));

  const unmappedValues = agg.byStatus.filter((s) => s.category === 'unmapped').map((s) => s.label);
  const otherStatuses = agg.byStatus.filter((s) => !isCoreStatus(s.label)).map((s) => s.label);

  return {
    scopes,
    statusMapped: mapping.status !== null,
    priorityMapped: mapping.priority !== null,
    assigneeMapped: mapping.assignee !== null,
    closed: { ...metric(agg.byCategory.closed, total), statuses: closedStatuses, configured: closedStatuses.length > 0 },
    closureRate: {
      percent: closedStatuses.length > 0 ? percentOf(agg.byCategory.closed, total) : null,
      configured: closedStatuses.length > 0,
      provisional: agg.byCategory.unmapped > 0,
      unmapped: agg.byCategory.unmapped,
    },
    openBacklog: { ...metric(agg.byCategory.open, total), statuses: openStatuses, configured: openStatuses.length > 0 },
    highPriorityOpen: {
      ...metric(hpCount, total),
      levels,
      group,
      configured: group.length > 0 && openStatuses.length > 0,
      numericConvention,
    },
    reopened: { ...metric(status('Reopened'), total), mapped: labelsMapped(values, 'Reopened') },
    readyForQa: { ...metric(status('Ready for QA'), total), mapped: labelsMapped(values, 'Ready for QA') },
    unassigned: metric(agg.unassigned, total),
    blocked: { ...metric(status('Blocked'), total), mapped: labelsMapped(values, 'Blocked') },
    unmappedStatus: { ...metric(agg.byCategory.unmapped, total), values: unmappedValues },
    newIssues: metric(status('New'), total),
    devInProgress: metric(status('Development in Progress'), total),
    otherStatuses: { ...metric(otherStatuses.reduce((s, l) => s + status(l), 0), total), statuses: otherStatuses },
  };
}
