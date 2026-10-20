import type { IssueRecord } from '@/types/issue';
import { BLANK_LABEL } from '@/types/issue';
import type { ColumnMapping, ValueMappings } from '@/types/mappings';
import { normKey } from '@/lib/text';
import { orderPriorities } from './aggregate';

export const DEFAULT_AGING_THRESHOLDS = [7, 14, 30];

export interface AgingBucket {
  label: string;
  /** Inclusive day range; max = null for the open-ended last bucket. */
  min: number;
  max: number | null;
  indexes: number[];
}

export interface AgingResult {
  available: boolean;
  reason?: string;
  /** Local calendar day used as "today". */
  referenceDate: Date;
  buckets: AgingBucket[];
  /** Open records that could be aged. */
  aged: number;
  missingCreated: number[];
  invalidCreated: number[];
  futureCreated: number[];
  oldestDays: number | null;
}

const DAY = 86_400_000;

function localDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Turn thresholds such as [7, 14, 30] into buckets 0–7, 8–14, 15–30, > 30 days. */
export function agingBuckets(thresholds: number[]): Omit<AgingBucket, 'indexes'>[] {
  const t = [...new Set(thresholds.filter((n) => Number.isFinite(n) && n >= 0).map((n) => Math.floor(n)))].sort((a, b) => a - b);
  const buckets: Omit<AgingBucket, 'indexes'>[] = [];
  let min = 0;
  for (const max of t) {
    if (max < min) continue;
    buckets.push({ label: `${min}–${max} days`, min, max });
    min = max + 1;
  }
  buckets.push({ label: t.length ? `More than ${t[t.length - 1]} days` : 'All ages', min, max: null });
  return buckets;
}

/**
 * Age since creation for records in the Open / Pending workflow category.
 * Age = whole local calendar days between the Created Date and the reference date.
 * Missing, unreadable and future Created Dates are reported, never aged.
 * This is not time spent in the current workflow state.
 */
export function calculateAging(records: IssueRecord[], mapping: ColumnMapping, thresholds: number[], referenceDate: Date = new Date()): AgingResult {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const base = { referenceDate: ref, missingCreated: [] as number[], invalidCreated: [] as number[], futureCreated: [] as number[] };
  if (mapping.created === null) {
    return { ...base, available: false, reason: 'No Created Date column is mapped, so aging analysis is unavailable.', buckets: [], aged: 0, oldestDays: null };
  }
  if (mapping.status === null) {
    return { ...base, available: false, reason: 'No Status column is mapped, so unresolved issues cannot be identified.', buckets: [], aged: 0, oldestDays: null };
  }
  const buckets: AgingBucket[] = agingBuckets(thresholds).map((b) => ({ ...b, indexes: [] }));
  let aged = 0;
  let oldest: number | null = null;
  for (const r of records) {
    if (r.statusCategory !== 'open') continue;
    if (r.invalidDates.includes('created')) {
      base.invalidCreated.push(r.index);
      continue;
    }
    if (!r.created) {
      base.missingCreated.push(r.index);
      continue;
    }
    const days = Math.round((ref.getTime() - localDay(r.created)) / DAY);
    if (days < 0) {
      base.futureCreated.push(r.index);
      continue;
    }
    aged++;
    oldest = oldest === null ? days : Math.max(oldest, days);
    const bucket = buckets.find((b) => days >= b.min && (b.max === null || days <= b.max));
    bucket?.indexes.push(r.index);
  }
  const anyDate = aged > 0 || base.futureCreated.length > 0;
  return {
    ...base,
    available: anyDate,
    reason: anyDate ? undefined : 'No open issue has a valid Created Date, so aging analysis is unavailable.',
    buckets,
    aged,
    oldestDays: oldest,
  };
}

export type RiskId = 'high-priority' | 'reopened' | 'aging' | 'unassigned' | 'incomplete' | 'qa-queue';

export interface RiskBreakdown {
  title: string;
  rows: { label: string; count: number }[];
}

export interface RiskIndicator {
  id: RiskId;
  title: string;
  /** Attention category; rank 1 (highest attention) to 6 (informational queue). */
  category: string;
  rank: number;
  count: number;
  available: boolean;
  /** What the count represents. */
  explanation: string;
  /** The exact inclusion rule. */
  rule: string;
  /** Missing data or configuration that limits the conclusion. */
  limitations: string[];
  /** record.index of every affected record (the drill-down set). */
  indexes: number[];
  breakdowns: RiskBreakdown[];
  /** Headline sub-counts shown on the card, e.g. P1 open / P2 open. */
  facts: { label: string; value: number | string }[];
}

function countBy(records: IssueRecord[], key: (r: IssueRecord) => string, order?: string[]): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const k = key(r) || BLANK_LABEL;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  const labels = order ? orderPriorities(map.keys(), order) : [...map.keys()].sort((a, b) => (map.get(b) ?? 0) - (map.get(a) ?? 0) || a.localeCompare(b));
  return labels.map((label) => ({ label, count: map.get(label) ?? 0 }));
}

export interface RiskInput {
  /** Records in the current analytics scope (duplicate rule + global filters). */
  records: IssueRecord[];
  values: ValueMappings;
  mapping: ColumnMapping;
  agingThresholds: number[];
  referenceDate?: Date;
}

/**
 * Attention indicators from explicit, visible rules. They flag records that may need
 * follow-up; they are not evidence of missed deadlines or delivery failure.
 */
export function calculateRiskIndicators(input: RiskInput): { indicators: RiskIndicator[]; aging: AgingResult } {
  const { records, values, mapping } = input;
  const statusMapped = mapping.status !== null;
  const priorityMapped = mapping.priority !== null;
  const order = values.priorityOrder;
  const openConfigured = Object.values(values.status).some((r) => r.category === 'open');
  const unmappedCount = records.filter((r) => r.statusCategory === 'unmapped').length;
  const statusLimit = unmappedCount > 0 ? [`${unmappedCount} record(s) have unmapped statuses and are not counted as open.`] : [];
  const byPriority = (rs: IssueRecord[]) => ({ title: 'By priority', rows: countBy(rs, (r) => r.priority, order) });
  const byAssignee = (rs: IssueRecord[]) => ({ title: 'By assignee', rows: countBy(rs, (r) => r.assignee) });
  const byStatus = (rs: IssueRecord[]) => ({ title: 'By status', rows: countBy(rs, (r) => r.status) });
  const indicators: RiskIndicator[] = [];

  // 1. High-priority backlog.
  {
    const group = values.highPriority;
    const set = new Set(group);
    const hits = records.filter((r) => r.statusCategory === 'open' && set.has(r.priority));
    const limitations = [...statusLimit];
    if (!priorityMapped) limitations.push('Priority column is not mapped.');
    else if (group.length === 0) limitations.push('No high-priority group is configured (Edit Mappings → Value mapping).');
    if (statusMapped && !openConfigured) limitations.push('No status is classified as Open / Pending.');
    if (Object.values(values.priority).some((r) => r.numeric && set.has(r.label))) limitations.push('Numeric priorities were read as P-levels (1 → P1); confirm the convention.');
    const unconfirmed = records.filter((r) => r.priorityRaw && values.priority[normKey(r.priorityRaw)]?.confirmed === false).length;
    if (unconfirmed) limitations.push(`${unconfirmed} record(s) have unconfirmed priority values and may be missing from this list.`);
    indicators.push({
      id: 'high-priority',
      title: 'High-priority backlog',
      category: 'Highest attention',
      rank: 1,
      count: hits.length,
      available: statusMapped && priorityMapped && group.length > 0,
      explanation: `Open issues in the high-priority group (${group.join(', ') || 'not configured'}).`,
      rule: `Priority ∈ {${group.join(', ')}} and workflow category = Open / Pending.`,
      limitations,
      indexes: hits.map((r) => r.index),
      breakdowns: [byPriority(hits), byAssignee(hits)],
      facts: group.map((p) => ({ label: `${p} open`, value: hits.filter((r) => r.priority === p).length })),
    });
  }

  // 2. Reopened.
  {
    const mapped = Object.values(values.status).some((r) => r.label === 'Reopened');
    const hits = records.filter((r) => r.status === 'Reopened');
    indicators.push({
      id: 'reopened',
      title: 'Reopened issues',
      category: 'Follow-up',
      rank: 2,
      count: hits.length,
      available: statusMapped,
      explanation: 'Records currently in the Reopened state. This is the current state only, not how often issues were reopened.',
      rule: 'Normalized status = Reopened.',
      limitations: mapped ? [] : ['No source status is mapped to Reopened.'],
      indexes: hits.map((r) => r.index),
      breakdowns: [byAssignee(hits), byPriority(hits)],
      facts: [{ label: 'With an ID', value: hits.filter((r) => r.id).length }],
    });
  }

  // 3. Aging.
  const aging = calculateAging(records, mapping, input.agingThresholds, input.referenceDate);
  {
    const lastBucket = aging.buckets[aging.buckets.length - 1];
    const oldIndexes = aging.available && aging.buckets.length > 1 ? lastBucket.indexes : [];
    const limitations = [...statusLimit];
    if (aging.missingCreated.length) limitations.push(`${aging.missingCreated.length} open record(s) have no Created Date.`);
    if (aging.invalidCreated.length) limitations.push(`${aging.invalidCreated.length} open record(s) have an unreadable Created Date.`);
    if (aging.futureCreated.length) limitations.push(`${aging.futureCreated.length} open record(s) have a Created Date in the future (flagged in Data Quality).`);
    indicators.push({
      id: 'aging',
      title: 'Aging open issues',
      category: 'Aging',
      rank: 3,
      count: oldIndexes.length,
      available: aging.available,
      explanation: aging.available
        ? `Open issues older than ${aging.buckets.length > 1 ? aging.buckets[aging.buckets.length - 2].max : 0} days (age since creation, as of ${aging.referenceDate.toLocaleDateString()}).`
        : (aging.reason ?? 'Aging analysis unavailable.'),
      rule: 'Workflow category = Open / Pending; age since creation = today − Created Date, in whole local days.',
      limitations,
      indexes: oldIndexes,
      breakdowns: aging.available ? [{ title: 'Age since creation (open issues)', rows: aging.buckets.map((b) => ({ label: b.label, count: b.indexes.length })) }] : [],
      facts: aging.available ? [{ label: 'Open issues aged', value: aging.aged }, { label: 'Oldest (days)', value: aging.oldestDays ?? '—' }] : [],
    });
  }

  // 4. Unassigned.
  {
    const hits = records.filter((r) => r.isUnassigned);
    indicators.push({
      id: 'unassigned',
      title: 'Unassigned issues',
      category: 'Ownership',
      rank: 4,
      count: hits.length,
      available: mapping.assignee !== null,
      explanation: 'Records with a blank or placeholder assignee.',
      rule: 'Assignee is blank, whitespace or a value marked as Unassigned in Value mapping.',
      limitations: mapping.assignee === null ? ['Assignee column is not mapped.'] : [],
      indexes: hits.map((r) => r.index),
      breakdowns: [byPriority(hits), byStatus(hits)],
      facts: [{ label: 'Of which open', value: hits.filter((r) => r.statusCategory === 'open').length }],
    });
  }

  // 5. Unmapped / incomplete records.
  {
    const parts: { label: string; test: (r: IssueRecord) => boolean; applies: boolean }[] = [
      { label: 'Missing status', test: (r) => r.statusRaw === '', applies: statusMapped },
      { label: 'Unmapped status', test: (r) => r.statusRaw !== '' && r.statusCategory === 'unmapped', applies: statusMapped },
      { label: 'Missing priority', test: (r) => r.priorityRaw === '', applies: priorityMapped },
      { label: 'Unmapped priority', test: (r) => r.priorityRaw !== '' && values.priority[normKey(r.priorityRaw)]?.confirmed === false, applies: priorityMapped },
      { label: 'Missing issue ID', test: (r) => r.id === '', applies: mapping.id !== null },
      // Only open issues need a Created Date (aging applies to them alone).
      { label: 'Missing Created Date (open issues)', test: (r) => r.statusCategory === 'open' && r.created === null && !r.invalidDates.includes('created'), applies: mapping.created !== null },
    ];
    const active = parts.filter((p) => p.applies);
    const hits = records.filter((r) => active.some((p) => p.test(r)));
    indicators.push({
      id: 'incomplete',
      title: 'Unmapped or incomplete records',
      category: 'Reporting quality',
      rank: 5,
      count: hits.length,
      available: active.length > 0,
      explanation: 'Records whose missing or unmapped values limit the accuracy of the figures above. Explicit "Unknown" priorities are not counted here.',
      rule: active.map((p) => p.label).join(' OR ') || 'No applicable checks.',
      limitations: parts.filter((p) => !p.applies).map((p) => `${p.label}: column not mapped, check skipped.`),
      indexes: hits.map((r) => r.index),
      breakdowns: [{ title: 'By problem (a record can appear more than once)', rows: active.map((p) => ({ label: p.label, count: records.filter(p.test).length })) }],
      facts: [],
    });
  }

  // 6. QA queue.
  {
    const mapped = Object.values(values.status).some((r) => r.label === 'Ready for QA');
    const hits = records.filter((r) => r.status === 'Ready for QA');
    const breakdowns = [byPriority(hits), byAssignee(hits)];
    if (mapping.project !== null) breakdowns.push({ title: 'By project', rows: countBy(hits, (r) => r.project) });
    else if (mapping.area !== null) breakdowns.push({ title: 'By area', rows: countBy(hits, (r) => r.area) });
    indicators.push({
      id: 'qa-queue',
      title: 'QA queue',
      category: 'Workflow queue',
      rank: 6,
      count: hits.length,
      available: statusMapped,
      explanation: 'Records currently Ready for QA. The assignee shown is the record owner; the file does not establish whether they are a tester.',
      rule: 'Normalized status = Ready for QA.',
      limitations: mapped ? [] : ['No source status is mapped to Ready for QA.'],
      indexes: hits.map((r) => r.index),
      breakdowns,
      facts: [],
    });
  }

  indicators.sort((a, b) => a.rank - b.rank);
  return { indicators, aging };
}
