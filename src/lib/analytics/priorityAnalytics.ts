import type { IssueRecord, WorkflowCategory } from '@/types/issue';
import type { Aggregates } from '@/types/analytics';
import type { ValueMappings } from '@/types/mappings';

export interface BacklogRow {
  priority: string;
  open: number;
  closed: number;
  unmapped: number;
  total: number;
}

/** Open / closed / unmapped counts per priority, in configured priority order. */
export function computeBacklog(agg: Aggregates): BacklogRow[] {
  return agg.byPriority.map(({ label }) => {
    const c: Record<WorkflowCategory, number> = agg.priorityCategory[label] ?? { open: 0, closed: 0, unmapped: 0 };
    return { priority: label, open: c.open, closed: c.closed, unmapped: c.unmapped, total: c.open + c.closed + c.unmapped };
  });
}

/** Records in the configured high-priority group, highest priority first. */
export function highPriorityRecords(records: IssueRecord[], values: ValueMappings): IssueRecord[] {
  const group = new Set(values.highPriority);
  if (group.size === 0) return [];
  const rank = new Map(values.priorityOrder.map((l, i) => [l, i]));
  return records
    .filter((r) => group.has(r.priority))
    .sort((a, b) => (rank.get(a.priority) ?? 999) - (rank.get(b.priority) ?? 999) || a.sourceRow - b.sourceRow);
}
