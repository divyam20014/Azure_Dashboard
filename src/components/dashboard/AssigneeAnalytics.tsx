import { useMemo, useState } from 'react';
import { ArrowDown, ArrowDownWideNarrow, ArrowUp, ArrowUpNarrowWide, ListFilter, Trophy, UserSearch } from 'lucide-react';
import { Section, Panel, EmptyState } from '@/components/common/Common';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { AssigneePriorityHeatmap } from '@/components/charts/AssigneePriorityHeatmap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GlobalFieldFilter } from '@/components/issues/IssueFilters';
import {
  assigneePriorityMatrix,
  computeLeaders,
  sortAndLimitAssignees,
  type AssigneeMetricsRow,
  type AssigneeSortKey,
  type MatrixMode,
  type SortDirection,
} from '@/lib/analytics/assigneeAnalytics';
import { UNASSIGNED_COLOR, UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { formatCount, formatPercent } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useDashboard } from './DashboardContext';

const TOP_N_OPTIONS = [5, 10, 25] as const;
const WORKLOAD_COLOR = '#2a78d6';

interface Column {
  key: AssigneeSortKey;
  label: string;
  value: (r: AssigneeMetricsRow) => number;
}

/** Workload visibility for resource planning. Counts describe distribution, never performance. */
export function AssigneeAnalytics() {
  const { analytics, dataset, select, filters, settings, scrollToRegister } = useDashboard();
  const { agg, colors, assigneeMetrics } = analytics;
  const m = dataset.config.columnMapping;
  const values = dataset.config.values;
  const hp = values.highPriority;
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [sortKey, setSortKey] = useState<AssigneeSortKey>('total');
  const [topN, setTopN] = useState<number | 'all'>(10);
  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>([]);
  const [matrixMode, setMatrixMode] = useState<MatrixMode>('all');
  const [thresholdText, setThresholdText] = useState(settings.settings.concentrationThreshold?.toString() ?? '');
  const threshold = settings.settings.concentrationThreshold;

  const priorities = agg.byPriority.map((p) => p.label);
  const people = agg.byAssignee.filter((a) => !a.isUnassigned);
  const unassignedAgg = agg.byAssignee.find((a) => a.isUnassigned) ?? null;
  // Ranking (display only): people first; Unassigned is not a person and is shown separately.
  const ranked = useMemo(() => sortAndLimitAssignees(people, { direction, search, topN, sortKey, highPriority: hp }), [people, direction, search, topN, sortKey, hp]);
  const chartList = useMemo(() => {
    const showUnassigned = unassignedAgg && (!search || unassignedAgg.name.toLowerCase().includes(search.toLowerCase()));
    return showUnassigned ? [...ranked, unassignedAgg] : ranked;
  }, [ranked, unassignedAgg, search]);
  const names = chartList.map((a) => a.name);
  const metricsByName = useMemo(() => new Map(assigneeMetrics.map((r) => [r.name, r])), [assigneeMetrics]);
  const leaders = useMemo(() => computeLeaders(agg, hp), [agg, hp]);
  const matrix = useMemo(() => {
    const full = assigneePriorityMatrix(agg, priorities, matrixMode);
    const order = new Map(names.map((n, i) => [n, i]));
    return { ...full, rows: full.rows.filter((r) => order.has(r.assignee)).sort((a, b) => (order.get(a.assignee) ?? 0) - (order.get(b.assignee) ?? 0)) };
  }, [agg, priorities.join('|'), names.join('|'), matrixMode]);

  if (m.assignee === null) {
    return (
      <Section id="assignees" title="Assignee Workload and Priority Matrix">
        <EmptyState title="Assignee column not mapped">Map an Assignee column in Edit Mappings to see workload analytics.</EmptyState>
      </Section>
    );
  }

  const selectAssignee = (name: string) => select(`assignee:${name}`, `Assignee = ${name}`, { assignee: [name] });
  const visibleStatuses = agg.byStatus.filter((s) => !hiddenStatuses.includes(s.label));
  const scrollBox = topN === 'all' || chartList.length > 25 ? 'max-h-[560px] overflow-y-auto pr-1' : '';
  const columns: Column[] = [
    { key: 'total', label: 'Total', value: (r) => r.total },
    ...(m.status !== null
      ? ([
          { key: 'closed', label: 'Closed', value: (r) => r.closed },
          { key: 'open', label: 'Open', value: (r) => r.open },
        ] as Column[])
      : []),
    ...hp.map((p) => ({ key: `priority:${p}` as AssigneeSortKey, label: p, value: (r: AssigneeMetricsRow) => r.levels[p] ?? 0 })),
    ...(hp.length > 1 ? [{ key: 'highPriority' as AssigneeSortKey, label: hp.join(' + '), value: (r: AssigneeMetricsRow) => r.highPriority }] : []),
    ...(m.status !== null
      ? ([
          { key: 'reopened', label: 'Reopened', value: (r) => r.reopened },
          { key: 'readyForQa', label: 'Ready for QA', value: (r) => r.readyForQa },
        ] as Column[])
      : []),
  ];
  const sortOptions: { key: AssigneeSortKey; label: string }[] = [
    ...columns.map((c) => ({ key: c.key, label: c.label })),
    ...priorities.filter((p) => !hp.includes(p)).map((p) => ({ key: `priority:${p}` as AssigneeSortKey, label: p })),
  ];
  const sortLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? 'Total';
  const headerSort = (key: AssigneeSortKey) => {
    if (key === sortKey) setDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setDirection('desc');
    }
  };
  const drilled = filters.state.global.assignee?.length === 1 ? filters.state.global.assignee[0] : null;
  const drilledRow = drilled ? metricsByName.get(drilled) : undefined;
  const tableRows = [...ranked.map((a) => metricsByName.get(a.name)!).filter(Boolean)];
  const unassignedRow = unassignedAgg && (!search || 'unassigned'.includes(search.toLowerCase())) ? metricsByName.get(unassignedAgg.name) : undefined;
  const aboveThreshold = (r: AssigneeMetricsRow) => threshold !== null && r.shareOfOpen !== null && r.shareOfOpen > threshold;
  const heatSorted = sortKey.startsWith('priority:') ? sortKey.slice('priority:'.length) : null;

  return (
    <Section
      id="assignees"
      title="Assignee Workload and Priority Matrix"
      description="Workload distribution for resource planning. Issue counts are not a measure of individual performance."
      collapsible
      collapsedSummary={`${formatCount(people.length)} assignee(s)${unassignedAgg ? ` · ${formatCount(unassignedAgg.total)} unassigned issue(s)` : ''}`}
    >
      {agg.total === 0 ? (
        <EmptyState title="No issues in the current scope">Adjust or clear the global filters.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="assignee-leaders">
            {leaders
              .filter((l) => (m.status !== null ? true : !/open|reopened|ready/i.test(l.metric)))
              .map((l) => (
                <Card key={l.metric} className="flex items-start gap-3 p-3">
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{l.metric}</p>
                    {l.count > 0 ? (
                      <p className="truncate text-sm font-semibold" title={l.names.join(', ')}>
                        {l.names.length > 2 ? `${l.names.slice(0, 2).join(', ')} +${l.names.length - 2} (tie)` : l.names.join(' & ')}
                        {l.names.length === 2 && <span className="font-normal text-muted-foreground"> (tie)</span>}
                        <span className="tabular ml-1 font-normal text-muted-foreground">· {formatCount(l.count)}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">None in scope</p>
                    )}
                  </div>
                </Card>
              ))}
          </div>

          {/* Display controls: never change the underlying records. */}
          <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2" aria-label="Assignee display options">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Display</span>
            <Input aria-label="Search assignees" placeholder="Search assignee…" className="h-8 w-44" value={search} onChange={(e) => setSearch(e.target.value)} />
            <NativeSelect aria-label="Sort assignees by" className="w-44" value={sortKey} onChange={(e) => setSortKey(e.target.value as AssigneeSortKey)}>
              {sortOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  Sort by {o.label}
                </option>
              ))}
            </NativeSelect>
            <Button variant="outline" size="sm" onClick={() => setDirection((d) => (d === 'desc' ? 'asc' : 'desc'))} aria-label={`Sort ${direction === 'desc' ? 'ascending' : 'descending'}`}>
              {direction === 'desc' ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
              {direction === 'desc' ? 'Highest first' : 'Lowest first'}
            </Button>
            <div role="radiogroup" aria-label="Number of assignees to show" className="flex overflow-hidden rounded-md border">
              {[...TOP_N_OPTIONS, 'all' as const].map((n) => (
                <button
                  key={String(n)}
                  type="button"
                  role="radio"
                  aria-checked={topN === n}
                  onClick={() => setTopN(n)}
                  className={cn('px-2.5 py-1 text-xs', topN === n ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}
                >
                  {n === 'all' ? 'All' : `Top ${n}`}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground" data-testid="assignee-display-count">
              Showing {formatCount(ranked.length)} of {formatCount(people.length)} assignees by {sortLabel}
              {unassignedAgg ? ' · Unassigned shown separately' : ''} (display limit only)
            </span>
          </div>

          {/* Dashboard filters: these change every section, like the global filter bar. */}
          <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2" aria-label="Assignee dashboard filters">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dashboard filters</span>
            <GlobalFieldFilter field="assignee" ariaLabel="Assignee section filter: assignees" label="Assignees" />
            {m.status !== null && <GlobalFieldFilter field="status" ariaLabel="Assignee section filter: status" label="Status" />}
            {m.priority !== null && <GlobalFieldFilter field="priority" ariaLabel="Assignee section filter: priority" label="Priority" />}
            <div className="ml-auto flex items-center gap-2">
              <UserSearch className="h-4 w-4 text-muted-foreground" aria-hidden />
              <NativeSelect
                aria-label="Drill down into an assignee"
                className="w-52"
                value={drilled ?? ''}
                onChange={(e) => filters.setGlobalField('assignee', e.target.value ? [e.target.value] : [])}
              >
                <option value="">Drill down: all assignees</option>
                {agg.byAssignee.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name} ({a.total})
                  </option>
                ))}
              </NativeSelect>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  filters.setGlobalField('assignee', []);
                  filters.setGlobalField('status', []);
                  filters.setGlobalField('priority', []);
                }}
              >
                Reset filters
              </Button>
            </div>
          </div>

          {drilled && (
            <Card className="space-y-3 p-4" data-testid="assignee-drilldown">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Drill-down: {drilled}</h3>
                <div className="flex flex-wrap gap-2">
                  {m.project !== null && <GlobalFieldFilter field="project" ariaLabel="Drill-down filter: project" />}
                  {m.area !== null && <GlobalFieldFilter field="area" ariaLabel="Drill-down filter: area" />}
                  {m.type !== null && <GlobalFieldFilter field="type" ariaLabel="Drill-down filter: work item type" />}
                  <Button size="sm" variant="outline" onClick={scrollToRegister}>
                    <ListFilter /> View issues
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => filters.setGlobalField('assignee', [])}>
                    Reset drill-down
                  </Button>
                </div>
              </div>
              {drilledRow ? (
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
                  {[
                    ['Total assigned', drilledRow.total],
                    ...(m.status !== null
                      ? [
                          ['Closed', drilledRow.closed],
                          ['Open', drilledRow.open],
                        ]
                      : []),
                    ...hp.map((p) => [p, drilledRow.levels[p] ?? 0]),
                    ...(m.status !== null
                      ? [
                          ['Reopened', drilledRow.reopened],
                          ['Ready for QA', drilledRow.readyForQa],
                        ]
                      : []),
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-md bg-secondary/60 p-2">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="tabular text-lg font-semibold">{formatCount(value as number)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No issues for this assignee match the other filters.</p>
              )}
              <p className="text-xs text-muted-foreground">Figures use the same rules as the rest of the dashboard; the issue register below lists the matching records.</p>
            </Card>
          )}

          <Panel
            title="Assignee summary"
            description="Click a column header to sort, or an assignee to drill down. Percentages are shares of the issues in scope and of the configured open backlog."
            actions={
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(thresholdText);
                  settings.update({ concentrationThreshold: thresholdText.trim() === '' || !Number.isFinite(n) ? null : n });
                }}
              >
                <label htmlFor="concentration-threshold" className="text-xs text-muted-foreground">
                  Highlight share of open backlog above
                </label>
                <Input id="concentration-threshold" className="h-8 w-16" inputMode="decimal" placeholder="off" value={thresholdText} onChange={(e) => setThresholdText(e.target.value)} />
                <span className="text-xs text-muted-foreground">%</span>
                <Button size="sm" variant="outline" type="submit">
                  Apply
                </Button>
              </form>
            }
          >
            {tableRows.length === 0 && !unassignedRow ? (
              <EmptyState title="No assignees match the search" />
            ) : (
              <div className="max-h-[520px] overflow-auto rounded-md border">
                <table className="w-full min-w-max text-sm" data-testid="assignee-summary-table">
                  <thead className="sticky top-0 z-10 bg-secondary text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        Assignee
                      </th>
                      {columns.map((c) => (
                        <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium" aria-sort={sortKey === c.key ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}>
                          <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => headerSort(c.key)}>
                            {c.label}
                            {sortKey === c.key && (direction === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                          </button>
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        % of issues
                      </th>
                      {m.status !== null && (
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          % of open backlog
                        </th>
                      )}
                      {m.status !== null && (
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          Unmapped status
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {[...tableRows, ...(unassignedRow ? [unassignedRow] : [])].map((r) => (
                      <tr key={r.name} className={cn('border-t', r.isUnassigned && 'bg-secondary/40 italic')}>
                        <th scope="row" className="px-3 py-1.5 text-left font-normal not-italic">
                          <button type="button" className="max-w-[240px] truncate text-left hover:text-primary hover:underline" title={r.name} onClick={() => filters.setGlobalField('assignee', [r.name])}>
                            {r.isUnassigned ? 'Unassigned (no owner)' : r.name}
                          </button>
                          {aboveThreshold(r) && !r.isUnassigned && (
                            <Badge variant="secondary" className="ml-2 not-italic">
                              &gt; {threshold}% of open
                            </Badge>
                          )}
                        </th>
                        {columns.map((c) => (
                          <td key={c.key} className="px-3 py-1.5 text-right">
                            {formatCount(c.value(r))}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right">{formatPercent(r.shareOfTotal)}</td>
                        {m.status !== null && <td className="px-3 py-1.5 text-right">{formatPercent(r.shareOfOpen)}</td>}
                        {m.status !== null && <td className="px-3 py-1.5 text-right text-muted-foreground">{formatCount(r.unmapped)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {threshold !== null && <p className="mt-2 text-xs text-muted-foreground">Highlight rule: assignee holds more than {threshold}% of the configured open backlog. Workload distribution only, not a performance rating.</p>}
          </Panel>

          {chartList.length === 0 ? (
            <EmptyState title="No assignees match the search" />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Total issues per assignee" description={`Ranked by ${sortLabel}. Click a bar to list that person's issues.`}>
                <div className={scrollBox}>
                  <SimpleBarChart
                    items={chartList.map((a) => ({ label: a.name, value: a.total, color: a.isUnassigned ? UNASSIGNED_COLOR : WORKLOAD_COLOR }))}
                    total={agg.total}
                    onSelect={selectAssignee}
                    ariaLabel="Bar chart of issues per assignee"
                  />
                </div>
              </Panel>

              {m.priority !== null && (
                <Panel title="Assignee by priority" description="Each segment is a configured priority. Click the legend to toggle priorities, a segment to list those issues.">
                  <div className={scrollBox}>
                    <StackedBarChart
                      categories={names}
                      series={priorities.map((p) => ({ name: p, color: colors.priority[p] ?? UNMAPPED_COLOR, values: chartList.map((a) => a.byPriority[p] ?? 0) }))}
                      ariaLabel="Stacked bar chart of assignees by priority"
                      onSelect={(name, priority) => select(`ap:${name}:${priority}`, `${name} · ${priority}`, { assignee: [name], priority: [priority] })}
                    />
                  </div>
                </Panel>
              )}

              {m.status !== null && (
                <Panel
                  title="Assignee by status"
                  description="Toggle statuses to focus the comparison. Unmapped statuses are included as their own segments."
                  className="xl:col-span-2"
                  actions={
                    <div className="flex max-w-full flex-wrap gap-1">
                      {agg.byStatus.map((s) => {
                        const hidden = hiddenStatuses.includes(s.label);
                        return (
                          <button
                            key={s.label}
                            type="button"
                            aria-pressed={!hidden}
                            onClick={() => setHiddenStatuses((h) => (hidden ? h.filter((x) => x !== s.label) : [...h, s.label]))}
                            className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', hidden ? 'opacity-50' : 'bg-secondary')}
                          >
                            <span className="h-2 w-2 rounded-sm" style={{ background: colors.status[s.label] ?? UNMAPPED_COLOR }} aria-hidden />
                            {s.label}
                            {s.category === 'unmapped' && ' (unmapped)'}
                          </button>
                        );
                      })}
                    </div>
                  }
                >
                  <div className={scrollBox}>
                    <StackedBarChart
                      categories={names}
                      series={visibleStatuses.map((s) => ({ name: s.label, color: colors.status[s.label] ?? UNMAPPED_COLOR, values: chartList.map((a) => a.byStatus[s.label] ?? 0) }))}
                      ariaLabel="Stacked bar chart of assignees by status"
                      showTotals={hiddenStatuses.length === 0}
                      onSelect={(name, status) => select(`as:${name}:${status}`, `${name} · ${status}`, { assignee: [name], status: [status] })}
                    />
                  </div>
                </Panel>
              )}

              {m.priority !== null && (
                <Panel
                  title="Assignee-priority matrix"
                  description={`${matrixMode === 'open' ? 'Open / Pending issues only (confirmed status classification).' : 'All issues in scope.'} Darker cells hold more issues; every cell shows its exact count. Click a cell to list those issues.`}
                  className="xl:col-span-2"
                  actions={
                    <NativeSelect aria-label="Heatmap counts" className="w-44" value={matrixMode} onChange={(e) => setMatrixMode(e.target.value as MatrixMode)} disabled={m.status === null}>
                      <option value="all">Total issues</option>
                      <option value="open">Open issues only</option>
                    </NativeSelect>
                  }
                >
                  {matrix.rows.length === 0 ? (
                    <EmptyState title={matrixMode === 'open' ? 'No open issues for the listed assignees' : 'No assignees to show'} />
                  ) : (
                    <AssigneePriorityHeatmap
                      priorities={priorities}
                      rows={matrix.rows}
                      columnTotals={matrix.columnTotals}
                      grandTotal={matrix.grandTotal}
                      max={matrix.max}
                      unit={matrixMode === 'open' ? 'open issues' : 'issues'}
                      sortedColumn={heatSorted}
                      onColumnSort={(p) => {
                        setSortKey(p ? (`priority:${p}` as AssigneeSortKey) : 'total');
                        setDirection('desc');
                      }}
                      onRowClick={(name) => filters.setGlobalField('assignee', [name])}
                      onCellClick={(name, priority) =>
                        select(`ap:${name}:${priority}:${matrixMode}`, `${name} · ${priority}${matrixMode === 'open' ? ' · open' : ''}`, {
                          assignee: [name],
                          priority: [priority],
                          ...(matrixMode === 'open' ? { category: ['open'] } : {}),
                        })
                      }
                    />
                  )}
                  {matrix.rows.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Rows follow the ranking above ({formatCount(matrix.rows.length)} shown, sorted by {sortLabel}); column totals cover all assignees in scope.
                    </p>
                  )}
                </Panel>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
