import type { IssueRecord, WorkflowCategory } from '@/types/issue';
import type { Aggregates, AssigneeAggregate, LabelCount, StatusCount } from '@/types/analytics';
import type { ValueMappings } from '@/types/mappings';
import { BLANK_LABEL } from '@/types/issue';
import { CORE_STATUSES } from '@/lib/normalization/statusNormalizer';

function emptyCategories(): Record<WorkflowCategory, number> {
  return { closed: 0, open: 0, unmapped: 0 };
}

/** Order statuses: the five core statuses first (fixed order), then others by count. */
export function orderStatuses(statusMap: Record<string, number>): string[] {
  const core = CORE_STATUSES.filter((s) => statusMap[s] !== undefined);
  const others = Object.keys(statusMap)
    .filter((s) => !(CORE_STATUSES as readonly string[]).includes(s))
    .sort((a, b) => statusMap[b] - statusMap[a] || a.localeCompare(b));
  return [...core, ...others];
}

/** Order priorities by the configured order; unknown labels last. */
export function orderPriorities(labels: Iterable<string>, priorityOrder: string[]): string[] {
  const rank = new Map(priorityOrder.map((l, i) => [l, i]));
  return [...new Set(labels)].sort((a, b) => (rank.get(a) ?? 9999) - (rank.get(b) ?? 9999) || a.localeCompare(b));
}

/**
 * One pass over the in-scope records producing every base aggregate the
 * dashboard needs. Percentages are derived at render time from these counts.
 */
export function computeAggregates(records: IssueRecord[], values: ValueMappings): Aggregates {
  const statusMap: Record<string, number> = {};
  const statusCategory: Record<string, WorkflowCategory> = {};
  const byCategory = emptyCategories();
  const priorityMap: Record<string, number> = {};
  const priorityStatus: Record<string, Record<string, number>> = {};
  const priorityCategory: Record<string, Record<WorkflowCategory, number>> = {};
  const assignees = new Map<string, AssigneeAggregate>();
  const typeMap: Record<string, number> = {};
  let unassigned = 0;

  for (const r of records) {
    statusMap[r.status] = (statusMap[r.status] ?? 0) + 1;
    statusCategory[r.status] = r.statusCategory;
    byCategory[r.statusCategory]++;
    priorityMap[r.priority] = (priorityMap[r.priority] ?? 0) + 1;

    const ps = (priorityStatus[r.priority] ??= {});
    ps[r.status] = (ps[r.status] ?? 0) + 1;
    const pc = (priorityCategory[r.priority] ??= emptyCategories());
    pc[r.statusCategory]++;

    let a = assignees.get(r.assignee);
    if (!a) {
      a = { name: r.assignee, isUnassigned: r.isUnassigned, total: 0, open: 0, closed: 0, unmapped: 0, byStatus: {}, byPriority: {}, byPriorityOpen: {} };
      assignees.set(r.assignee, a);
    }
    a.total++;
    a[r.statusCategory]++;
    a.byStatus[r.status] = (a.byStatus[r.status] ?? 0) + 1;
    a.byPriority[r.priority] = (a.byPriority[r.priority] ?? 0) + 1;
    if (r.statusCategory === 'open') a.byPriorityOpen[r.priority] = (a.byPriorityOpen[r.priority] ?? 0) + 1;
    if (r.isUnassigned) unassigned++;

    const type = r.type || BLANK_LABEL;
    typeMap[type] = (typeMap[type] ?? 0) + 1;
  }

  const byStatus: StatusCount[] = orderStatuses(statusMap).map((label) => ({ label, count: statusMap[label], category: statusCategory[label] }));
  const byPriority: LabelCount[] = orderPriorities(Object.keys(priorityMap), values.priorityOrder).map((label) => ({ label, count: priorityMap[label] }));
  const byAssignee = [...assignees.values()].sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
  const byType = Object.entries(typeMap)
    .map(([label, count]) => ({ label, count }))
    .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));

  return {
    total: records.length,
    byStatus,
    statusMap,
    byCategory,
    byPriority,
    priorityMap,
    priorityStatus,
    priorityCategory,
    byAssignee,
    byType,
    unassigned,
  };
}
