import { useMemo, useState } from 'react';
import { Section, Panel, EmptyState, Notice, Swatch } from '@/components/common/Common';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { CATEGORY_COLORS, CATEGORY_LABELS, UNMAPPED_COLOR } from '@/lib/normalization/statusNormalizer';
import { computeBacklog, highPriorityRecords } from '@/lib/analytics/priorityAnalytics';
import { formatCount, formatDate } from '@/lib/text';
import { Button } from '@/components/ui/button';
import type { WorkflowCategory } from '@/types/issue';
import { useDashboard } from './DashboardContext';

const HP_PAGE = 25;

export function PriorityAnalytics() {
  const { analytics, dataset, select, openRecord } = useDashboard();
  const { agg, colors, scoped } = analytics;
  const values = dataset.config.values;
  const m = dataset.config.columnMapping;
  const [hpLimit, setHpLimit] = useState(HP_PAGE);

  const distribution = useMemo(() => agg.byPriority.map((p) => ({ label: p.label, value: p.count, color: colors.priority[p.label] ?? UNMAPPED_COLOR })), [agg, colors]);
  const priorities = agg.byPriority.map((p) => p.label);
  const statusSeries = useMemo(
    () =>
      agg.byStatus.map((s) => ({
        name: s.label,
        color: colors.status[s.label] ?? UNMAPPED_COLOR,
        values: agg.byPriority.map((p) => agg.priorityStatus[p.label]?.[s.label] ?? 0),
      })),
    [agg, colors],
  );
  const backlog = useMemo(() => computeBacklog(agg), [agg]);
  const backlogSeries = useMemo(() => {
    const cats: WorkflowCategory[] = ['open', 'closed', 'unmapped'];
    return cats
      .filter((c) => backlog.some((b) => b[c] > 0))
      .map((c) => ({ name: CATEGORY_LABELS[c], color: CATEGORY_COLORS[c], values: backlog.map((b) => b[c]) }));
  }, [backlog]);
  const highPriority = useMemo(() => highPriorityRecords(scoped, values), [scoped, values]);
  const categoryConfigured = Object.values(values.status).some((r) => r.category !== 'unmapped');

  if (m.priority === null) {
    return (
      <Section id="priority" title="Priority Analysis">
        <EmptyState title="Priority column not mapped">Map a Priority column in Edit Mappings to see priority analytics.</EmptyState>
      </Section>
    );
  }

  const selectPriority = (label: string) => select(`priority:${label}`, `Priority = ${label}`, { priority: [label] });

  return (
    <Section id="priority" title="Priority Analysis" description={`Priority order: ${values.priorityOrder.join(' › ') || '—'}`}>
      {agg.total === 0 ? (
        <EmptyState title="No issues in the current scope">Adjust or clear the global filters.</EmptyState>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Priority distribution" description="Issue count and share per priority (including unknown values).">
              <SimpleBarChart items={distribution} total={agg.total} onSelect={selectPriority} ariaLabel="Bar chart of issues by priority" />
            </Panel>
            {m.status !== null && (
              <Panel title="Priority by status" description="Status mix within each priority. Click a segment to list those issues.">
                <StackedBarChart
                  categories={priorities}
                  series={statusSeries}
                  ariaLabel="Stacked bar chart of priority by status"
                  onSelect={(priority, status) => select(`ps:${priority}:${status}`, `${priority} · ${status}`, { priority: [priority], status: [status] })}
                />
              </Panel>
            )}
          </div>

          {m.status !== null && (
            <Panel title="Priority backlog" description="Open, closed and unmapped issues per priority, using your workflow classification.">
              {!categoryConfigured ? (
                <EmptyState title="Workflow categories not configured">Classify statuses as Open or Closed to calculate the backlog.</EmptyState>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
                  <StackedBarChart
                    categories={priorities}
                    series={backlogSeries}
                    ariaLabel="Stacked bar chart of open and closed issues per priority"
                    onSelect={(priority, seriesName) => {
                      const cat = (Object.keys(CATEGORY_LABELS) as WorkflowCategory[]).find((c) => CATEGORY_LABELS[c] === seriesName);
                      if (cat) select(`pb:${priority}:${cat}`, `${priority} · ${seriesName}`, { priority: [priority], category: [cat] });
                    }}
                  />
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b">
                          <th className="py-1.5 text-left font-medium">Priority</th>
                          <th className="py-1.5 text-right font-medium">Open</th>
                          <th className="py-1.5 text-right font-medium">Closed</th>
                          <th className="py-1.5 text-right font-medium">Unmapped</th>
                          <th className="py-1.5 text-right font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {backlog.map((b) => (
                          <tr key={b.priority} className="border-b last:border-0">
                            <td className="py-1.5">
                              <span className="inline-flex items-center gap-1.5">
                                <Swatch color={colors.priority[b.priority] ?? UNMAPPED_COLOR} />
                                {b.priority}
                              </span>
                            </td>
                            <td className="py-1.5 text-right font-medium">{formatCount(b.open)}</td>
                            <td className="py-1.5 text-right">{formatCount(b.closed)}</td>
                            <td className="py-1.5 text-right text-muted-foreground">{formatCount(b.unmapped)}</td>
                            <td className="py-1.5 text-right">{formatCount(b.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Panel>
          )}

          <Panel
            title={`High-priority issues (${formatCount(highPriority.length)})`}
            description={values.highPriority.length ? `High-priority group: ${values.highPriority.join(', ')} — configurable in Edit Mappings.` : 'No high-priority group configured.'}
          >
            {values.highPriority.length === 0 ? (
              <Notice tone="warning">Select which priorities form the high-priority group in Edit Mappings → Value mapping.</Notice>
            ) : highPriority.length === 0 ? (
              <EmptyState title="No high-priority issues in the current scope" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm" data-testid="high-priority-table">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b">
                        {m.id !== null && <th className="py-2 pr-3 text-left font-medium">Issue ID</th>}
                        {m.title !== null && <th className="py-2 pr-3 text-left font-medium">Title</th>}
                        <th className="py-2 pr-3 text-left font-medium">Status</th>
                        <th className="py-2 pr-3 text-left font-medium">Priority</th>
                        {m.assignee !== null && <th className="py-2 pr-3 text-left font-medium">Assignee</th>}
                        {m.created !== null && <th className="py-2 pr-3 text-left font-medium">Created</th>}
                        {m.project !== null && <th className="py-2 text-left font-medium">Project</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {highPriority.slice(0, hpLimit).map((r) => (
                        <tr key={r.index} className="cursor-pointer border-b last:border-0 hover:bg-secondary/60" onClick={() => openRecord(r)}>
                          {m.id !== null && <td className="py-1.5 pr-3 font-medium text-primary">{r.id || '—'}</td>}
                          {m.title !== null && <td className="max-w-[320px] truncate py-1.5 pr-3" title={r.title}>{r.title}</td>}
                          <td className="py-1.5 pr-3">
                            <span className="inline-flex items-center gap-1.5">
                              <Swatch color={colors.status[r.status] ?? UNMAPPED_COLOR} />
                              {r.status}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">{r.priority}</td>
                          {m.assignee !== null && <td className="py-1.5 pr-3">{r.assignee}</td>}
                          {m.created !== null && <td className="tabular py-1.5 pr-3">{formatDate(r.created)}</td>}
                          {m.project !== null && <td className="py-1.5">{r.project}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {highPriority.length > hpLimit && (
                  <Button variant="link" size="sm" onClick={() => setHpLimit((n) => n + HP_PAGE)}>
                    Show more ({formatCount(highPriority.length - hpLimit)} remaining)
                  </Button>
                )}
              </>
            )}
          </Panel>
        </>
      )}
    </Section>
  );
}
