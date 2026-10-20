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

/** Sort / rank metrics available for assignees. 'priority:<label>' ranks by one priority level. */
export type AssigneeSortKey = 'total' | 'open' | 'closed' | 'reopened' | 'readyForQa' | 'highPriority' | `priority:${string}`;

export function assigneeSortValue(a: AssigneeAggregate, key: AssigneeSortKey, highPriority: string[] = []): number {
  switch (key) {
    case 'total':
      return a.total;
    case 'open':
      return a.open;
    case 'closed':
      return a.closed;
    case 'reopened':
      return a.byStatus['Reopened'] ?? 0;
    case 'readyForQa':
      return a.byStatus['Ready for QA'] ?? 0;
    case 'highPriority':
      return highPriority.reduce((s, p) => s + (a.byPriority[p] ?? 0), 0);
    default:
      return a.byPriority[key.slice('priority:'.length)] ?? 0;
  }
}

/**
 * Search, sort and Top-N for assignee charts and tables. Top-N only limits what is
 * displayed; it never filters the underlying records.
 */
export function sortAndLimitAssignees(
  assignees: AssigneeAggregate[],
  options: { direction: SortDirection; search: string; topN: number | 'all'; sortKey?: AssigneeSortKey; highPriority?: string[] },
): AssigneeAggregate[] {
  const q = options.search.trim().toLowerCase();
  const key = options.sortKey ?? 'total';
  let list = q ? assignees.filter((a) => a.name.toLowerCase().includes(q)) : [...assignees];
  const value = (a: AssigneeAggregate) => assigneeSortValue(a, key, options.highPriority);
  list.sort((x, y) => (options.direction === 'desc' ? value(y) - value(x) : value(x) - value(y)) || x.name.localeCompare(y.name));
  if (options.topN !== 'all') list = list.slice(0, options.topN);
  return list;
}

export interface AssigneeMetricsRow {
  name: string;
  isUnassigned: boolean;
  total: number;
  closed: number;
  open: number;
  unmapped: number;
  /** Issue count per high-priority level (all workflow states). */
  levels: Record<string, number>;
  /** Combined count over the high-priority group. */
  highPriority: number;
  reopened: number;
  readyForQa: number;
  /** Share of all in-scope issues held by this assignee. */
  shareOfTotal: number | null;
  /** Share of the configured open backlog held by this assignee. */
  shareOfOpen: number | null;
}

/** Per-assignee workload figures (distribution only — not a performance measure). */
export function calculateAssigneeMetrics(agg: Aggregates, highPriority: string[]): AssigneeMetricsRow[] {
  const totalOpen = agg.byCategory.open;
  return agg.byAssignee.map((a) => {
    const levels = Object.fromEntries(highPriority.map((p) => [p, a.byPriority[p] ?? 0]));
    return {
      name: a.name,
      isUnassigned: a.isUnassigned,
      total: a.total,
      closed: a.closed,
      open: a.open,
      unmapped: a.unmapped,
      levels,
      highPriority: Object.values(levels).reduce((s, n) => s + n, 0),
      reopened: a.byStatus['Reopened'] ?? 0,
      readyForQa: a.byStatus['Ready for QA'] ?? 0,
      shareOfTotal: agg.total ? (a.total / agg.total) * 100 : null,
      shareOfOpen: totalOpen ? (a.open / totalOpen) * 100 : null,
    };
  });
}

export interface MatrixRow {
  assignee: string;
  cells: number[];
  total: number;
}

export type MatrixMode = 'all' | 'open';

/**
 * Assignee x priority counts. Columns follow the given priority order. In 'open' mode only
 * records in the Open / Pending workflow category are counted.
 */
export function assigneePriorityMatrix(agg: Aggregates, priorities: string[], mode: MatrixMode = 'all'): { rows: MatrixRow[]; columnTotals: number[]; max: number; grandTotal: number } {
  let max = 0;
  const columnTotals = priorities.map(() => 0);
  const rows = agg.byAssignee
    .map((a) => {
      const source = mode === 'open' ? a.byPriorityOpen : a.byPriority;
      const cells = priorities.map((p, i) => {
        const v = source[p] ?? 0;
        columnTotals[i] += v;
        if (v > max) max = v;
        return v;
      });
      return { assignee: a.name, cells, total: mode === 'open' ? a.open : a.total };
    })
    .filter((r) => mode === 'all' || r.total > 0);
  return { rows, columnTotals, max, grandTotal: columnTotals.reduce((s, n) => s + n, 0) };
}
