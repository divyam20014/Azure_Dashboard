import { useMemo } from 'react';
import { Section, Panel, EmptyState } from '@/components/common/Common';
import { StatusDonutChart } from '@/components/charts/StatusDonutChart';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { UNASSIGNED_COLOR, UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { sortAndLimitAssignees } from '@/lib/analytics/assigneeAnalytics';
import { formatCount } from '@/lib/text';
import { KpiCards } from './KpiCards';
import { useDashboard } from './DashboardContext';

const OVERVIEW_TOP_N = 10;

/** Executive dashboard: KPI cards plus the four overview charts, all from the shared analytics. */
export function ExecutiveDashboard() {
  const { analytics, dataset, select, filters } = useDashboard();
  const { agg, colors, executive } = analytics;
  const m = dataset.config.columnMapping;
  const selected = filters.state.selection;

  const statusItems = useMemo(() => agg.byStatus.map((s) => ({ label: s.label, count: s.count, color: colors.status[s.label] ?? UNMAPPED_COLOR })), [agg, colors]);
  const priorityItems = useMemo(() => agg.byPriority.map((p) => ({ label: p.label, value: p.count, color: colors.priority[p.label] ?? UNMAPPED_COLOR })), [agg, colors]);
  const backlogItems = useMemo(
    () => agg.byPriority.map((p) => ({ label: p.label, value: agg.priorityCategory[p.label]?.open ?? 0, color: colors.priority[p.label] ?? UNMAPPED_COLOR })).filter((i) => i.value > 0),
    [agg, colors],
  );
  const workload = useMemo(() => sortAndLimitAssignees(agg.byAssignee, { direction: 'desc', search: '', topN: OVERVIEW_TOP_N }), [agg]);
  const selectedStatus = selected?.source.startsWith('status:') ? (selected.criteria.status?.[0] ?? null) : null;
  const selectedPriority = selected?.source.startsWith('priority:') ? (selected.criteria.priority?.[0] ?? null) : null;

  return (
    <Section
      id="overview"
      title="Executive Dashboard"
      description={
        executive.scopes.filtered
          ? `Figures reflect the ${formatCount(executive.scopes.inScope)} records matching the global filters (of ${formatCount(executive.scopes.included)} in analytics). Click a card or chart element to list the matching issues.`
          : `Figures reflect all ${formatCount(executive.scopes.included)} records in analytics. Click a card or chart element to list the matching issues.`
      }
    >
      <KpiCards />
      {agg.total === 0 ? (
        <EmptyState title="No issues in the current scope">Adjust or clear the global filters.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {m.status !== null && (
            <Panel title="Issue status distribution" description="Share of issues per normalized status, unmapped ones included.">
              <StatusDonutChart
                items={statusItems}
                total={agg.total}
                selected={selectedStatus}
                height={300}
                onSelect={(label) => select(`status:${label}`, `Status = ${label}`, { status: [label] })}
                title="Issue status distribution"
                ariaLabel="Donut chart of issues by status"
              />
            </Panel>
          )}
          {m.priority !== null && (
            <Panel title="Priority distribution" description="Issues per priority in configured order (all workflow states).">
              <SimpleBarChart
                items={priorityItems}
                total={agg.total}
                selected={selectedPriority}
                onSelect={(label) => select(`priority:${label}`, `Priority = ${label}`, { priority: [label] })}
                title="Priority distribution"
                ariaLabel="Bar chart of issues by priority"
              />
            </Panel>
          )}
          {m.priority !== null && m.status !== null && (
            <Panel title="Open backlog by priority" description="Open / Pending issues per priority (confirmed status classification only).">
              {backlogItems.length === 0 ? (
                <EmptyState title={executive.openBacklog.configured ? 'No open issues in scope' : 'No status is classified as Open / Pending'} />
              ) : (
                <SimpleBarChart
                  items={backlogItems}
                  total={executive.openBacklog.count}
                  onSelect={(label) => select(`backlog:${label}`, `${label} · open`, { priority: [label], category: ['open'] })}
                  title="Open backlog by priority"
                ariaLabel="Bar chart of open issues by priority"
                  valueAxisName="Open issues"
                />
              )}
            </Panel>
          )}
          {m.assignee !== null && (
            <Panel
              title="Assignee workload overview"
              description={
                agg.byAssignee.length > OVERVIEW_TOP_N
                  ? `Top ${OVERVIEW_TOP_N} of ${agg.byAssignee.length} assignees by total issues (display limit only). See Assignee Workload for all.`
                  : 'Total issues per assignee. Workload distribution, not performance.'
              }
            >
              <SimpleBarChart
                items={workload.map((a) => ({ label: a.name, value: a.total, color: a.isUnassigned ? UNASSIGNED_COLOR : '#2a78d6' }))}
                total={agg.total}
                labelWidth={120}
                onSelect={(name) => select(`assignee:${name}`, `Assignee = ${name}`, { assignee: [name] })}
                title="Assignee workload overview"
                ariaLabel="Overview bar chart of top assignees by issues"
              />
            </Panel>
          )}
        </div>
      )}
    </Section>
  );
}
