import type { Aggregates, AssigneeAggregate } from '@/types/analytics';

export interface Leader {
  metric: string;
  /** All assignees tied for the maximum (empty when the maximum is zero). */
  names: string[];
  count: number;
}

function leaderBy(assignees: AssigneeAggregate[], metric: string, value: (a: AssigneeAggregate) => number, includeUnassigned = false): Leader {
  let best = 0;
  let names: string[] = [];
  for (const a of assignees) {
    if (a.isUnassigned && !includeUnassigned) continue;
    const v = value(a);
    if (v > best) {
      best = v;
      names = [a.name];
    } else if (v === best && v > 0) {
      names.push(a.name);
    }
  }
  return { metric, names, count: best };
}

/**
 * "Who has the most …" answers. Unassigned is excluded because it is not a person.
 * Ties are reported as ties rather than picking one name.
 */
export function computeLeaders(agg: Aggregates, highPriority: string[]): Leader[] {
  const people = agg.byAssignee;
  const leaders: Leader[] = [leaderBy(people, 'Highest total issues', (a) => a.total)];
  for (const p of highPriority.slice(0, 2)) leaders.push(leaderBy(people, `Most ${p} issues`, (a) => a.byPriority[p] ?? 0));
  leaders.push(leaderBy(people, 'Most open issues', (a) => a.open));
  leaders.push(leaderBy(people, 'Most reopened issues', (a) => a.byStatus['Reopened'] ?? 0));
  leaders.push(leaderBy(people, 'Most issues ready for QA', (a) => a.byStatus['Ready for QA'] ?? 0));
  return leaders;
}

export type SortDirection = 'desc' | 'asc';

export function sortAndLimitAssignees(
  assignees: AssigneeAggregate[],
  options: { direction: SortDirection; search: string; topN: number | 'all' },
): AssigneeAggregate[] {
  const q = options.search.trim().toLowerCase();
  let list = q ? assignees.filter((a) => a.name.toLowerCase().includes(q)) : [...assignees];
  list.sort((x, y) => (options.direction === 'desc' ? y.total - x.total : x.total - y.total) || x.name.localeCompare(y.name));
  if (options.topN !== 'all') list = list.slice(0, options.topN);
  return list;
}

export interface MatrixRow {
  assignee: string;
  cells: number[];
  total: number;
}

/** Assignee x priority counts. Columns follow the given priority order. */
export function assigneePriorityMatrix(agg: Aggregates, priorities: string[]): { rows: MatrixRow[]; columnTotals: number[]; max: number } {
  let max = 0;
  const columnTotals = priorities.map(() => 0);
  const rows = agg.byAssignee.map((a) => {
    const cells = priorities.map((p, i) => {
      const v = a.byPriority[p] ?? 0;
      columnTotals[i] += v;
      if (v > max) max = v;
      return v;
    });
    return { assignee: a.name, cells, total: a.total };
  });
  return { rows, columnTotals, max };
}
