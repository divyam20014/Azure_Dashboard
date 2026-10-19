import { useMemo } from 'react';
import { Section, Panel, EmptyState, Notice, Swatch } from '@/components/common/Common';
import { StatusDonutChart } from '@/components/charts/StatusDonutChart';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { CATEGORY_COLORS, CATEGORY_LABELS, CORE_STATUSES, UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { configuredCategories, otherStatuses } from '@/lib/analytics/statusAnalytics';
import { formatCount, formatPercent } from '@/lib/text';
import type { WorkflowCategory } from '@/types/issue';
import { useDashboard } from './DashboardContext';

export function StatusAnalytics() {
  const { analytics, dataset, select, filters } = useDashboard();
  const { agg, closure, colors } = analytics;
  const values = dataset.config.values;
  const mapped = dataset.config.columnMapping.status !== null;
  const selectedStatus = filters.state.selection?.source.startsWith('status:') ? (filters.state.selection.criteria.status?.[0] ?? null) : null;

  const donutItems = useMemo(() => agg.byStatus.map((s) => ({ label: s.label, count: s.count, color: colors.status[s.label] ?? UNMAPPED_COLOR })), [agg, colors]);

  const comparison = useMemo(() => {
    const others = otherStatuses(agg);
    const otherCount = others.reduce((s, l) => s + (agg.statusMap[l] ?? 0), 0);
    return [
      ...CORE_STATUSES.map((s) => ({ label: s, value: agg.statusMap[s] ?? 0, color: colors.status[s] ?? UNMAPPED_COLOR })),
      { label: 'Other statuses', value: otherCount, color: UNMAPPED_COLOR },
    ];
  }, [agg, colors]);

  const configured = configuredCategories(values);
  const workflowItems = useMemo(() => {
    const cats: WorkflowCategory[] = [];
    if (configured.closed) cats.push('closed');
    if (configured.open) cats.push('open');
    if (agg.byCategory.unmapped > 0) cats.push('unmapped');
    return cats.map((c) => ({ label: CATEGORY_LABELS[c], value: agg.byCategory[c], color: CATEGORY_COLORS[c], category: c }));
  }, [agg, configured.closed, configured.open]);

  const selectStatus = (label: string) => select(`status:${label}`, `Status = ${label}`, { status: [label] });

  if (!mapped) {
    return (
      <Section id="status" title="Issue Status Overview">
        <EmptyState title="Status column not mapped">Map a Status column in Edit Mappings to see status analytics.</EmptyState>
      </Section>
    );
  }

  return (
    <Section id="status" title="Issue Status Overview" description="Current-state snapshot of the uploaded data. Click a segment or bar to list those issues in the register.">
      {agg.total === 0 ? (
        <EmptyState title="No issues in the current scope">Adjust or clear the global filters.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Status distribution" description={`${agg.byStatus.length} status value(s), including unmapped ones.`}>
            <StatusDonutChart items={donutItems} total={agg.total} selected={selectedStatus} onSelect={selectStatus} ariaLabel="Donut chart of issues by status" />
          </Panel>
          <Panel title="Status comparison" description="Core workflow statuses in fixed order; everything else is grouped as Other.">
            <SimpleBarChart
              items={comparison}
              total={agg.total}
              orientation="vertical"
              height={320}
              ariaLabel="Bar chart comparing status counts"
              onSelect={(label) => {
                if (label === 'Other statuses') {
                  const others = otherStatuses(agg);
                  if (others.length) select('status:__other', 'Other statuses', { status: others });
                } else selectStatus(label);
              }}
            />
          </Panel>
          <Panel title="Workflow distribution" description="Open vs closed according to your status classification.">
            {workflowItems.length === 0 || (!configured.closed && !configured.open) ? (
              <EmptyState title="Workflow categories not configured">Classify statuses as Open or Closed in Edit Mappings → Value mapping.</EmptyState>
            ) : (
              <SimpleBarChart
                items={workflowItems}
                total={agg.total}
                ariaLabel="Bar chart of issues by workflow category"
                onSelect={(label) => {
                  const item = workflowItems.find((w) => w.label === label);
                  if (item) select(`category:${item.category}`, `Workflow = ${label}`, { category: [item.category] });
                }}
              />
            )}
          </Panel>
          <Panel title="Closure percentage" description="Closed-category issues ÷ issues in scope.">
            <div className="flex flex-col gap-3" data-testid="closure-panel">
              <div className="flex items-baseline gap-3">
                <span className="tabular text-4xl font-semibold tracking-tight">{closure.configured ? formatPercent(closure.percent) : 'Not configured'}</span>
                {closure.configured && (
                  <span className="text-sm text-muted-foreground">
                    {formatCount(closure.closedCount)} of {formatCount(agg.total)} issues
                  </span>
                )}
              </div>
              {closure.configured ? (
                <>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${closure.percent ?? 0}%`, backgroundColor: CATEGORY_COLORS.closed }} />
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Counted as closed: </span>
                    {closure.closedStatuses.map((s) => (
                      <span key={s} className="mr-2 inline-flex items-center gap-1">
                        <Swatch color={colors.status[s] ?? UNMAPPED_COLOR} />
                        {s}
                      </span>
                    ))}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No status is classified as Closed, so a closure percentage would be misleading. Classify statuses in Edit Mappings.</p>
              )}
              {closure.unmappedCount > 0 && (
                <Notice tone="warning">
                  {formatCount(closure.unmappedCount)} issue(s) have unmapped statuses and are counted as neither open nor closed.
                </Notice>
              )}
              <p className="text-xs text-muted-foreground">This is a snapshot of current states, not a historical closure trend.</p>
            </div>
          </Panel>
        </div>
      )}
    </Section>
  );
}
