import { useMemo } from 'react';
import { Download, ListFilter, Siren } from 'lucide-react';
import { Section, Panel, EmptyState } from '@/components/common/Common';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/Toast';
import { ACTIVE_FOCUS_STATUSES, UNASSIGNED_COLOR } from '@/lib/normalization/statusNormalizer';
import { csvBlob, tableToCsv } from '@/lib/export/csvExporter';
import { issueRegisterTable } from '@/lib/export/reportTables';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { formatCount, formatPercent, percentOf } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useDashboard } from './DashboardContext';

interface Row {
  name: string;
  isUnassigned: boolean;
  counts: number[];
  total: number;
  totalAll: number;
}

/**
 * The three states that need an owner's action right now, by assignee. A focused,
 * single-purpose complement to the broader Assignee Workload section below it.
 */
export function ActiveWorkByAssignee() {
  const { analytics, dataset, select, selectRecords, isSelected, filters, scrollToRegister } = useDashboard();
  const { agg, colors } = analytics;
  const m = dataset.config.columnMapping;
  const notify = useToast();
  const statuses = [...ACTIVE_FOCUS_STATUSES];

  const rows = useMemo<Row[]>(() => {
    return agg.byAssignee
      .map((a) => {
        const counts = statuses.map((s) => a.byStatus[s] ?? 0);
        return { name: a.name, isUnassigned: a.isUnassigned, counts, total: counts.reduce((x, y) => x + y, 0), totalAll: a.total };
      })
      .filter((r) => r.total > 0)
      .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
  }, [agg, statuses.join('|')]);

  const people = rows.filter((r) => !r.isUnassigned);
  const unassignedRow = rows.find((r) => r.isUnassigned) ?? null;
  const ordered = unassignedRow ? [...people, unassignedRow] : people;
  const activeIndexes = useMemo(() => analytics.scoped.filter((r) => (statuses as string[]).includes(r.status)).map((r) => r.index), [analytics.scoped, statuses.join('|')]);
  const totalActive = statuses.reduce((s, st) => s + (agg.statusMap[st] ?? 0), 0);

  const exportAll = () => {
    const records = activeIndexes.map((i) => dataset.records[i]);
    downloadBlob(csvBlob(tableToCsv(issueRegisterTable(records, dataset, 'Active Work'))), exportFileName(dataset, 'active-work-by-assignee', 'csv'));
    notify(`Exported ${formatCount(records.length)} active record(s).`);
  };

  if (m.status === null) {
    return (
      <Section id="active-work" title="Active Work by Assignee">
        <EmptyState title="Status column not mapped">Map a Status column in Edit Mappings to see who currently owns New, Reopened and Development-in-Progress issues.</EmptyState>
      </Section>
    );
  }
  if (m.assignee === null) {
    return (
      <Section id="active-work" title="Active Work by Assignee">
        <EmptyState title="Assignee column not mapped">Map an Assignee column in Edit Mappings to see who currently owns New, Reopened and Development-in-Progress issues.</EmptyState>
      </Section>
    );
  }

  return (
    <Section
      id="active-work"
      title="Active Work by Assignee"
      description="New, Reopened and Development-in-Progress issues only — the states that need an owner's action right now — broken down by who holds them."
      collapsible
      collapsedSummary={`${formatCount(totalActive)} active issue(s) across ${formatCount(ordered.length)} assignee(s)`}
      actions={
        <Button size="sm" variant="outline" disabled={totalActive === 0} onClick={exportAll}>
          <Download /> Export CSV
        </Button>
      }
    >
      {agg.total === 0 ? (
        <EmptyState title="No issues in the current scope">Adjust or clear the global filters.</EmptyState>
      ) : totalActive === 0 ? (
        <EmptyState title="No active work in scope">No issues are currently New, Reopened or Development in Progress.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="active-work-stats">
            {statuses.map((s) => {
              const count = agg.statusMap[s] ?? 0;
              const active = isSelected(`active-status:${s}`);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => select(`active-status:${s}`, s, { status: [s] })}
                  className={cn('rounded-lg border bg-card p-3 text-left transition-shadow hover:shadow-md', active && 'ring-2 ring-primary')}
                >
                  <span className="mb-1 block h-1 w-8 rounded-full" style={{ backgroundColor: colors.status[s] ?? UNASSIGNED_COLOR }} aria-hidden />
                  <p className="text-xs text-muted-foreground">{s}</p>
                  <p className="tabular text-2xl font-semibold">{formatCount(count)}</p>
                  <p className="text-xs text-muted-foreground">{formatPercent(percentOf(count, agg.total))} of scope</p>
                </button>
              );
            })}
            <Card className="flex flex-col justify-center gap-1 p-3" data-testid="active-work-total">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Siren className="h-3.5 w-3.5" aria-hidden /> Total active
              </div>
              <p className="tabular text-2xl font-semibold">{formatCount(totalActive)}</p>
              <Button size="sm" variant="ghost" className="h-7 w-fit px-2" onClick={() => selectRecords('active-work:all', 'Active work (New + Reopened + Dev in Progress)', activeIndexes)}>
                <ListFilter /> View in register
              </Button>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Active issues per assignee" description="New + Reopened + Development in Progress, stacked by status. Click a segment to list those issues.">
              <StackedBarChart
                categories={ordered.map((r) => r.name)}
                series={statuses.map((s, i) => ({ name: s, color: colors.status[s] ?? UNASSIGNED_COLOR, values: ordered.map((r) => r.counts[i]) }))}
                title="Active issues per assignee"
                ariaLabel="Stacked bar chart of active issues per assignee"
                onSelect={(name, status) => select(`active:${name}:${status}`, `${name} · ${status}`, { assignee: [name], status: [status] })}
              />
            </Panel>

            <Panel title="Active work summary" description="Click an assignee to filter the dashboard to them, or a count to list those issues in the register.">
              <div className="max-h-[420px] overflow-auto rounded-md border">
                <table className="w-full min-w-max text-sm" data-testid="active-work-table">
                  <thead className="sticky top-0 z-10 bg-secondary text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">
                        Assignee
                      </th>
                      {statuses.map((s) => (
                        <th key={s} scope="col" className="px-3 py-2 text-right font-medium">
                          {s}
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Total active
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        % of their issues
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {ordered.map((r) => (
                      <tr key={r.name} className={cn('border-t', r.isUnassigned && 'bg-secondary/40 italic')}>
                        <th scope="row" className="px-3 py-1.5 text-left font-normal not-italic">
                          <button type="button" className="max-w-[200px] truncate text-left hover:text-primary hover:underline" title={r.name} onClick={() => filters.setGlobalField('assignee', [r.name])}>
                            {r.isUnassigned ? 'Unassigned (no owner)' : r.name}
                          </button>
                        </th>
                        {statuses.map((s, i) => (
                          <td key={s} className="px-3 py-1.5 text-right">
                            {r.counts[i] > 0 ? (
                              <button
                                type="button"
                                className="rounded px-1 hover:bg-secondary hover:underline"
                                onClick={() => {
                                  select(`active:${r.name}:${s}`, `${r.name} · ${s}`, { assignee: [r.name], status: [s] });
                                  scrollToRegister();
                                }}
                              >
                                {formatCount(r.counts[i])}
                              </button>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right font-semibold">{formatCount(r.total)}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">{formatPercent(percentOf(r.total, r.totalAll))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </>
      )}
    </Section>
  );
}
