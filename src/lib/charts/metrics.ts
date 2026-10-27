import type { IssueRecord } from '@/types/issue';
import type { Dataset } from '@/types/analytics';
import type { MetricId } from './chartConfig';

/**
 * count:   number of records matching the metric's condition
 * percentTotal: count ÷ all records in the chart scope × 100
 * percentGroup: count ÷ records of the same primary category × 100
 * average: mean age in days (records without a valid, non-future Created Date excluded)
 * distinct: number of distinct non-blank issue IDs
 */
export type MetricKind = 'count' | 'percentTotal' | 'percentGroup' | 'average' | 'distinct';

export interface MetricDef {
  id: MetricId;
  label: string;
  explanation: string;
  kind: MetricKind;
  /** Values of different categories can be added up (stacks, pies, "Other"). */
  additive: boolean;
  unit: '' | '%' | 'days';
  /** Records counted by count-type metrics (default: all records). */
  predicate?: (r: IssueRecord) => boolean;
  available: boolean;
  reason?: string;
}

const DAY = 86_400_000;

/** Age in whole local days since creation, or null when unknown / invalid / in the future. */
export function ageInDays(r: IssueRecord, today: Date): number | null {
  if (!r.created || r.invalidDates.includes('created')) return null;
  const ref = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const created = new Date(r.created.getFullYear(), r.created.getMonth(), r.created.getDate()).getTime();
  const days = Math.round((ref - created) / DAY);
  return days < 0 ? null : days;
}

/** All metrics with their availability for this dataset and mapping. */
export function metricDefinitions(dataset: Dataset): MetricDef[] {
  const m = dataset.config.columnMapping;
  const v = dataset.config.values;
  const statusRules = Object.values(v.status);
  const statusMapped = m.status !== null;
  const hasClosed = statusRules.some((r) => r.category === 'closed');
  const hasOpen = statusRules.some((r) => r.category === 'open');
  const unmappedStatuses = statusRules.some((r) => r.category === 'unmapped');
  const caveat = unmappedStatuses ? ' Records with unmapped states are excluded; the result may be incomplete.' : '';
  const hp = v.highPriority;
  const hpSet = new Set(hp);
  const labelMapped = (label: string) => statusRules.some((r) => r.label === label);
  const off = (reason: string) => ({ available: false, reason });
  const on = { available: true };

  const defs: MetricDef[] = [
    { id: 'count', label: 'Issue count', explanation: 'Number of records in each group.', kind: 'count', additive: true, unit: '', ...on },
    { id: 'percentTotal', label: 'Percentage of total issues', explanation: 'Records in the group ÷ all records shown by this chart (after filters) × 100.', kind: 'percentTotal', additive: true, unit: '%', ...on },
    {
      id: 'percentGroup',
      label: 'Percentage within each group',
      explanation: 'Records in the segment ÷ records of the same primary category × 100 (each category adds up to 100 %). Needs a secondary grouping.',
      kind: 'percentGroup',
      additive: false,
      unit: '%',
      ...on,
    },
    {
      id: 'closed',
      label: 'Closed issue count',
      explanation: `Records whose state is mapped to the Closed workflow category.${caveat}`,
      kind: 'count',
      additive: true,
      unit: '',
      predicate: (r) => r.statusCategory === 'closed',
      ...(statusMapped && hasClosed ? on : off(statusMapped ? 'No state is mapped to the Closed category.' : 'No State column is mapped.')),
    },
    {
      id: 'open',
      label: 'Open issue count',
      explanation: `Records whose state is mapped to the Open / Pending workflow category.${caveat}`,
      kind: 'count',
      additive: true,
      unit: '',
      predicate: (r) => r.statusCategory === 'open',
      ...(statusMapped && hasOpen ? on : off(statusMapped ? 'No state is mapped to the Open / Pending category.' : 'No State column is mapped.')),
    },
    {
      id: 'unmapped',
      label: 'Unmapped / unknown-state issues',
      explanation: 'Records whose state has no workflow category, including blank states.',
      kind: 'count',
      additive: true,
      unit: '',
      predicate: (r) => r.statusCategory === 'unmapped',
      ...(statusMapped ? on : off('No State column is mapped.')),
    },
    {
      id: 'highPriority',
      label: hp.length ? `${hp.join(' + ')} issue count (configured high-priority group)` : 'High-priority issue count',
      explanation: hp.length ? `Records with priority ${hp.join(' or ')}, the high-priority group set in the priority mapping (all workflow states).` : 'Choose a high-priority group in Edit Mappings.',
      kind: 'count',
      additive: true,
      unit: '',
      predicate: (r) => hpSet.has(r.priority),
      ...(m.priority !== null && hp.length ? on : off(m.priority === null ? 'No Priority column is mapped.' : 'No high-priority group is configured.')),
    },
    {
      id: 'highPriorityOpen',
      label: hp.length ? `${hp.join(' + ')} open backlog` : 'High-priority open backlog',
      explanation: `Records in the configured high-priority group whose state is Open / Pending.${caveat}`,
      kind: 'count',
      additive: true,
      unit: '',
      predicate: (r) => hpSet.has(r.priority) && r.statusCategory === 'open',
      ...(m.priority !== null && hp.length && statusMapped && hasOpen ? on : off(!hp.length ? 'No high-priority group is configured.' : 'Open states are not configured.')),
    },
    {
      id: 'reopened',
      label: 'Reopened issue count (current state)',
      explanation: 'Records currently in the Reopened state. This is not a count of historical reopen events.',
      kind: 'count',
      additive: true,
      unit: '',
      predicate: (r) => r.status === 'Reopened',
      ...(statusMapped && labelMapped('Reopened') ? on : off('No state is mapped to Reopened.')),
    },
    {
      id: 'readyForQa',
      label: 'Ready for QA issue count',
      explanation: 'Records currently in the Ready for QA state (per the state mapping).',
      kind: 'count',
      additive: true,
      unit: '',
      predicate: (r) => r.status === 'Ready for QA',
      ...(statusMapped && labelMapped('Ready for QA') ? on : off('No state is mapped to Ready for QA.')),
    },
    {
      id: 'unassigned',
      label: 'Unassigned issue count',
      explanation: 'Records with a blank or placeholder assignee.',
      kind: 'count',
      additive: true,
      unit: '',
      predicate: (r) => r.isUnassigned,
      ...(m.assignee !== null ? on : off('No Assignee column is mapped.')),
    },
    {
      id: 'avgAge',
      label: 'Average age since creation (days)',
      explanation: 'Mean whole days between the Created Date and today. Records without a valid Created Date, or with a future one, are excluded.',
      kind: 'average',
      additive: false,
      unit: 'days',
      ...(m.created !== null && dataset.records.some((r) => r.created !== null) ? on : off(m.created === null ? 'No Created Date column is mapped.' : 'No record has a valid Created Date.')),
    },
    {
      id: 'distinctIds',
      label: 'Distinct issue IDs',
      explanation: 'Number of different non-blank issue IDs (repeated IDs are counted once; blank IDs are not counted).',
      kind: 'distinct',
      additive: false,
      unit: '',
      ...(m.id !== null ? on : off('No Issue ID column is mapped.')),
    },
  ];
  // One count metric per configured priority level (e.g. "P1 issue count").
  if (m.priority !== null) {
    for (const label of v.priorityOrder) {
      defs.push({
        id: `priority:${label}`,
        label: `${label} issue count`,
        explanation: `Records whose mapped priority is ${label} (all workflow states).`,
        kind: 'count',
        additive: true,
        unit: '',
        predicate: (r) => r.priority === label,
        ...on,
      });
    }
  }
  return defs;
}

export function metricById(defs: MetricDef[], id: MetricId): MetricDef | undefined {
  return defs.find((d) => d.id === id);
}

/** Metrics that can be compared side by side as series (same unit: issue counts). */
export function comparableMetrics(defs: MetricDef[]): MetricDef[] {
  return defs.filter((d) => d.kind === 'count' && d.available);
}
