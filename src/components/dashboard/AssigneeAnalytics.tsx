import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Trophy, UserSearch } from 'lucide-react';
import { Section, Panel, EmptyState, Notice } from '@/components/common/Common';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { AssigneePriorityHeatmap } from '@/components/charts/AssigneePriorityHeatmap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { computeLeaders, sortAndLimitAssignees, assigneePriorityMatrix, type SortDirection } from '@/lib/analytics/assigneeAnalytics';
import { UNASSIGNED_COLOR, UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { formatCount } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useDashboard } from './DashboardContext';

const TOP_N_OPTIONS = [10, 15, 25, 50] as const;
const WORKLOAD_COLOR = '#2a78d6';

export function AssigneeAnalytics() {
  const { analytics, dataset, select, filters } = useDashboard();
  const { agg, colors } = analytics;
  const m = dataset.config.columnMapping;
  const values = dataset.config.values;
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<SortDirection>('desc');
  const [topN, setTopN] = useState<number | 'all'>(15);
  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>([]);

  const list = useMemo(() => sortAndLimitAssignees(agg.byAssignee, { direction, search, topN }), [agg, direction, search, topN]);
  const names = list.map((a) => a.name);
  const leaders = useMemo(() => computeLeaders(agg, values.highPriority), [agg, values.highPriority]);
  const priorities = agg.byPriority.map((p) => p.label);
  const matrix = useMemo(() => {
    const full = assigneePriorityMatrix(agg, priorities);
    const shown = new Set(names);
    return { ...full, rows: full.rows.filter((r) => shown.has(r.assignee)).sort((a, b) => names.indexOf(a.assignee) - names.indexOf(b.assignee)) };
  }, [agg, priorities.join('|'), names.join('|')]);

  if (m.assignee === null) {
    return (
      <Section id="assignees" title="Assignee Performance and Workload">
        <EmptyState title="Assignee column not mapped">Map an Assignee column in Edit Mappings to see workload analytics.</EmptyState>
      </Section>
    );
  }

  const selectAssignee = (name: string) => select(`assignee:${name}`, `Assignee = ${name}`, { assignee: [name] });
  const visibleStatuses = agg.byStatus.filter((s) => !hiddenStatuses.includes(s.label));
  const scrollBox = topN === 'all' || list.length > 25 ? 'max-h-[560px] overflow-y-auto pr-1' : '';

  return (
    <Section
      id="assignees"
      title="Assignee Performance and Workload"
      description="How issues are distributed across people. Issue counts describe workload only — they are not a performance rating."
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

          <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
            <Input aria-label="Search assignees" placeholder="Search assignee…" className="h-8 w-48" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => setDirection((d) => (d === 'desc' ? 'asc' : 'desc'))} aria-label={`Sort ${direction === 'desc' ? 'ascending' : 'descending'}`}>
              {direction === 'desc' ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
              {direction === 'desc' ? 'Most issues first' : 'Fewest issues first'}
            </Button>
            <NativeSelect aria-label="Number of assignees to show" className="w-36" value={String(topN)} onChange={(e) => setTopN(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              {TOP_N_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
              <option value="all">All assignees</option>
            </NativeSelect>
            <span className="text-xs text-muted-foreground">
              Showing {formatCount(list.length)} of {formatCount(agg.byAssignee.length)} assignees
            </span>
            <div className="ml-auto flex items-center gap-2">
              <UserSearch className="h-4 w-4 text-muted-foreground" aria-hidden />
              <NativeSelect
                aria-label="Drill down into an assignee"
                className="w-52"
                value={filters.state.global.assignee?.length === 1 ? filters.state.global.assignee[0] : ''}
                onChange={(e) => filters.setGlobalField('assignee', e.target.value ? [e.target.value] : [])}
              >
                <option value="">Drill down: all assignees</option>
                {agg.byAssignee.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name} ({a.total})
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          {filters.state.global.assignee?.length === 1 && (
            <Notice>
              Drill-down active for <b>{filters.state.global.assignee[0]}</b>: every section now shows only their issues. Narrow further with the Status, Priority, Type, Project or
              Area filters at the top, then review the Issue Register.{' '}
              <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => filters.setGlobalField('assignee', [])}>
                Reset drill-down
              </button>
            </Notice>
          )}

          {list.length === 0 ? (
            <EmptyState title="No assignees match the search" />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Total issues per assignee" description="Click a bar to list that person's issues.">
                <div className={scrollBox}>
                  <SimpleBarChart
                    items={list.map((a) => ({ label: a.name, value: a.total, color: a.isUnassigned ? UNASSIGNED_COLOR : WORKLOAD_COLOR }))}
                    total={agg.total}
                    onSelect={selectAssignee}
                    ariaLabel="Bar chart of issues per assignee"
                  />
                </div>
              </Panel>

              {m.status !== null && (
                <Panel
                  title="Assignee by status"
                  description="Toggle statuses to focus the comparison."
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
                          </button>
                        );
                      })}
                    </div>
                  }
                >
                  <div className={scrollBox}>
                    <StackedBarChart
                      categories={names}
                      series={visibleStatuses.map((s) => ({ name: s.label, color: colors.status[s.label] ?? UNMAPPED_COLOR, values: list.map((a) => a.byStatus[s.label] ?? 0) }))}
                      ariaLabel="Stacked bar chart of assignees by status"
                      showTotals={hiddenStatuses.length === 0}
                      onSelect={(name, status) => select(`as:${name}:${status}`, `${name} · ${status}`, { assignee: [name], status: [status] })}
                    />
                  </div>
                </Panel>
              )}

              {m.priority !== null && (
                <Panel title="Assignee by priority" description="Number of issues per person for each priority level.">
                  <div className={scrollBox}>
                    <StackedBarChart
                      categories={names}
                      series={priorities.map((p) => ({ name: p, color: colors.priority[p] ?? UNMAPPED_COLOR, values: list.map((a) => a.byPriority[p] ?? 0) }))}
                      ariaLabel="Stacked bar chart of assignees by priority"
                      onSelect={(name, priority) => select(`ap:${name}:${priority}`, `${name} · ${priority}`, { assignee: [name], priority: [priority] })}
                    />
                  </div>
                </Panel>
              )}

              {m.priority !== null && (
                <Panel title="Assignee-priority matrix" description="Darker cells hold more issues. Click a cell to list those issues." className="xl:col-span-2">
                  <AssigneePriorityHeatmap
                    priorities={priorities}
                    rows={matrix.rows}
                    columnTotals={matrix.columnTotals}
                    grandTotal={agg.total}
                    max={matrix.max}
                    onRowClick={selectAssignee}
                    onCellClick={(name, priority) => select(`ap:${name}:${priority}`, `${name} · ${priority}`, { assignee: [name], priority: [priority] })}
                  />
                  {matrix.rows.length < agg.byAssignee.length && (
                    <p className="mt-2 text-xs text-muted-foreground">Rows follow the assignee list above; column totals cover all assignees in scope.</p>
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
