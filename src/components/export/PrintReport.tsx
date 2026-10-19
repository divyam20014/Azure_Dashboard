import { useEffect, useMemo, type ReactNode } from 'react';
import { Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { StatusDonutChart } from '@/components/charts/StatusDonutChart';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { UNMAPPED_COLOR, UNASSIGNED_COLOR } from '@/lib/normalization/statusNormalizer';
import { formatCount, formatPercent } from '@/lib/text';

const TOP_ASSIGNEES = 20;

function ReportSection({ title, children, breakBefore }: { title: string; children: ReactNode; breakBefore?: boolean }) {
  return (
    <section className={breakBefore ? 'print-page-break mt-8' : 'mt-8'}>
      <h2 className="mb-3 border-b pb-1 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Print-friendly report. Rendered in the page and printed with the browser's own
 * print dialog (choose "Save as PDF") — no server-side conversion.
 */
export function PrintReport({ onClose }: { onClose: () => void }) {
  const { dataset, analytics } = useDashboard();
  const { agg, kpis, summary, colors, closure, filterDescription } = analytics;
  const m = dataset.config.columnMapping;
  const q = dataset.quality;
  const generated = useMemo(() => new Date(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const statusItems = agg.byStatus.map((s) => ({ label: s.label, count: s.count, color: colors.status[s.label] ?? UNMAPPED_COLOR }));
  const priorityItems = agg.byPriority.map((p) => ({ label: p.label, value: p.count, color: colors.priority[p.label] ?? UNMAPPED_COLOR }));
  const assigneeItems = agg.byAssignee.slice(0, TOP_ASSIGNEES).map((a) => ({ label: a.name, value: a.total, color: a.isUnassigned ? UNASSIGNED_COLOR : '#2a78d6' }));

  return (
    <ScrubOnUnmount className="fixed inset-0 z-40 overflow-y-auto bg-background print:static print:overflow-visible" role="dialog" aria-label="Printable report">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card px-4 py-2">
        <p className="text-sm text-muted-foreground">Print preview — use your browser&apos;s print dialog and choose “Save as PDF” to create a PDF.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> Print / Save as PDF
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            <X /> Close
          </Button>
        </div>
      </div>

      <article className="mx-auto max-w-[800px] bg-card px-8 py-8 text-card-foreground print:max-w-none print:p-0" data-testid="print-report">
        <header className="border-b pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">QA Issue Analytics Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Issue Tracking, Workload and Quality Insights</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Source file</dt>
            <dd className="truncate">{dataset.file.fileName}{dataset.file.kind !== 'csv' ? ` · ${dataset.file.sheetName}` : ''}</dd>
            <dt className="text-muted-foreground">Generated</dt>
            <dd>{generated.toLocaleString()}</dd>
            <dt className="text-muted-foreground">Records in scope</dt>
            <dd>
              {formatCount(agg.total)} of {formatCount(dataset.records.length)} imported
            </dd>
            {filterDescription && (
              <>
                <dt className="text-muted-foreground">Filters</dt>
                <dd>{filterDescription}</dd>
              </>
            )}
          </dl>
        </header>

        <ReportSection title="Key metrics">
          <table className="w-full text-sm">
            <tbody>
              {kpis.map((k) => (
                <tr key={k.key} className="border-b last:border-0">
                  <td className="py-1.5">{k.label}</td>
                  <td className="tabular py-1.5 text-right font-semibold">{formatCount(k.count)}</td>
                  <td className="tabular w-24 py-1.5 text-right text-muted-foreground">{k.key === 'total' ? '' : formatPercent(k.percent)}</td>
                </tr>
              ))}
              {m.status !== null && (
                <tr>
                  <td className="py-1.5">Closure percentage</td>
                  <td className="tabular py-1.5 text-right font-semibold">{closure.configured ? formatPercent(closure.percent) : 'Not configured'}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </ReportSection>

        <ReportSection title="Executive summary and key insights">
          <p className="text-sm leading-relaxed">{summary.headline}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {summary.insights.map((i) => (
              <li key={i.id}>
                <b>{i.title}:</b> {i.text}
              </li>
            ))}
          </ul>
          <div className="mt-3 text-xs text-muted-foreground">
            {summary.notes.map((n) => (
              <p key={n}>• {n}</p>
            ))}
          </div>
        </ReportSection>

        {m.status !== null && agg.total > 0 && (
          <ReportSection title="Status distribution" breakBefore>
            <div className="print-avoid-break">
              <StatusDonutChart items={statusItems} total={agg.total} height={420} legendType="plain" ariaLabel="Status distribution" />
            </div>
          </ReportSection>
        )}

        {m.priority !== null && agg.total > 0 && (
          <ReportSection title="Priority distribution">
            <div className="print-avoid-break">
              <SimpleBarChart items={priorityItems} total={agg.total} ariaLabel="Priority distribution" />
            </div>
          </ReportSection>
        )}

        {m.assignee !== null && agg.total > 0 && (
          <ReportSection title={`Assignee workload${agg.byAssignee.length > TOP_ASSIGNEES ? ` (top ${TOP_ASSIGNEES} of ${agg.byAssignee.length})` : ''}`} breakBefore>
            <div className="print-avoid-break">
              <SimpleBarChart items={assigneeItems} total={agg.total} ariaLabel="Assignee workload" labelWidth={170} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Issue counts describe workload distribution, not individual performance.</p>
          </ReportSection>
        )}

        <ReportSection title="Data quality summary">
          <table className="w-full text-sm">
            <tbody className="tabular">
              {[
                ['Total imported rows', q.totalImportedRows],
                ['Valid issue records', q.validRecords],
                ['Blank rows', q.blankRows],
                ['Missing issue IDs', q.missingIds],
                ['Records with duplicate IDs', q.duplicateIdRecords],
                ['Missing statuses', q.missingStatuses],
                ['Missing assignees', q.missingAssignees],
                ['Missing priorities', q.missingPriorities],
                ['Records with invalid dates', q.invalidDates],
                ['Records with unmapped statuses', q.unmappedStatusRecords],
                ['Records with unmapped priorities', q.unmappedPriorityRecords],
              ].map(([label, value]) => (
                <tr key={label as string} className="border-b last:border-0">
                  <td className="py-1.5">{label}</td>
                  <td className="py-1.5 text-right font-medium">{formatCount(value as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>

        <footer className="mt-10 border-t pt-3 text-xs text-muted-foreground">
          Generated locally in the browser by QA Issue Analytics Dashboard. The source file was not uploaded to any server.
        </footer>
      </article>
    </ScrubOnUnmount>
  );
}
