import type { IssueRecord } from '@/types/issue';
import type { ValueMappings } from '@/types/mappings';
import { percentOf } from '@/lib/text';

export interface FieldChange {
  id: string;
  title: string;
  field: 'Status' | 'Priority' | 'Assignee';
  previous: string;
  current: string;
  previousIndex: number;
  currentIndex: number;
}

export interface MetricChange {
  metric: string;
  previous: number;
  current: number;
  change: number;
  /** Relative change in %, null when the previous value is zero. */
  percentChange: number | null;
}

export interface SnapshotComparison {
  previousTotal: number;
  currentTotal: number;
  matched: number;
  /** IDs present in the current export only — not necessarily newly created. */
  newlyObserved: IssueRecord[];
  /** IDs present in the previous export only — not necessarily deleted or closed. */
  noLongerPresent: IssueRecord[];
  statusChanges: FieldChange[];
  priorityChanges: FieldChange[];
  assigneeChanges: FieldChange[];
  /** Matched IDs that moved from a non-closed to a Closed workflow category. */
  closedBetween: FieldChange[];
  /** Matched IDs that moved from Closed to Open / Pending. */
  reopenedBetween: FieldChange[];
  metrics: MetricChange[];
  /** Records that could not be matched because they have no ID. */
  unmatchablePrevious: number;
  unmatchableCurrent: number;
  /** IDs that occur more than once in a snapshot; only the first occurrence is compared. */
  ambiguousIds: number;
}

function firstById(records: IssueRecord[]): { map: Map<string, IssueRecord>; noId: number; duplicates: number } {
  const map = new Map<string, IssueRecord>();
  let noId = 0;
  let duplicates = 0;
  for (const r of records) {
    if (!r.id) {
      noId++;
      continue;
    }
    if (map.has(r.id)) duplicates++;
    else map.set(r.id, r);
  }
  return { map, noId, duplicates };
}

function snapshotMetrics(records: IssueRecord[], highPriority: string[]) {
  const hp = new Set(highPriority);
  return {
    'Total records': records.length,
    'Closed (workflow category)': records.filter((r) => r.statusCategory === 'closed').length,
    'Open backlog': records.filter((r) => r.statusCategory === 'open').length,
    [`High-priority open (${highPriority.join(', ') || 'not configured'})`]: records.filter((r) => r.statusCategory === 'open' && hp.has(r.priority)).length,
    'Reopened (current state)': records.filter((r) => r.status === 'Reopened').length,
    'Ready for QA': records.filter((r) => r.status === 'Ready for QA').length,
    Unassigned: records.filter((r) => r.isUnassigned).length,
    'Unmapped status': records.filter((r) => r.statusCategory === 'unmapped').length,
  };
}

/**
 * Compare two snapshots by stable issue ID. Both are normalized with the same value
 * mappings. A record missing from the newer export is only "no longer present in the
 * export"; one appearing for the first time is only "newly observed".
 */
export function compareSnapshots(previous: IssueRecord[], current: IssueRecord[], values: ValueMappings): SnapshotComparison {
  const prev = firstById(previous);
  const curr = firstById(current);
  const newlyObserved: IssueRecord[] = [];
  const statusChanges: FieldChange[] = [];
  const priorityChanges: FieldChange[] = [];
  const assigneeChanges: FieldChange[] = [];
  const closedBetween: FieldChange[] = [];
  const reopenedBetween: FieldChange[] = [];
  let matched = 0;

  for (const [id, c] of curr.map) {
    const p = prev.map.get(id);
    if (!p) {
      newlyObserved.push(c);
      continue;
    }
    matched++;
    const change = (field: FieldChange['field'], a: string, b: string): FieldChange => ({ id, title: c.title, field, previous: a, current: b, previousIndex: p.index, currentIndex: c.index });
    if (p.status !== c.status) statusChanges.push(change('Status', p.status, c.status));
    if (p.priority !== c.priority) priorityChanges.push(change('Priority', p.priority, c.priority));
    if (p.assignee !== c.assignee) assigneeChanges.push(change('Assignee', p.assignee, c.assignee));
    if (p.statusCategory !== 'closed' && c.statusCategory === 'closed') closedBetween.push(change('Status', p.status, c.status));
    if (p.statusCategory === 'closed' && c.statusCategory === 'open') reopenedBetween.push(change('Status', p.status, c.status));
  }
  const noLongerPresent = [...prev.map.entries()].filter(([id]) => !curr.map.has(id)).map(([, r]) => r);

  const before = snapshotMetrics(previous, values.highPriority);
  const after = snapshotMetrics(current, values.highPriority);
  const metrics: MetricChange[] = Object.keys(after).map((metric) => {
    const a = before[metric] ?? 0;
    const b = after[metric] ?? 0;
    return { metric, previous: a, current: b, change: b - a, percentChange: a === 0 ? null : (percentOf(b - a, a) as number) };
  });

  return {
    previousTotal: previous.length,
    currentTotal: current.length,
    matched,
    newlyObserved,
    noLongerPresent,
    statusChanges,
    priorityChanges,
    assigneeChanges,
    closedBetween,
    reopenedBetween,
    metrics,
    unmatchablePrevious: prev.noId,
    unmatchableCurrent: curr.noId,
    ambiguousIds: prev.duplicates + curr.duplicates,
  };
}
