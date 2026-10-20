import { useEffect, useMemo, type ReactNode } from 'react';
import { ArrowLeft, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { useToast } from '@/components/common/Toast';
import { StatusDonutChart } from '@/components/charts/StatusDonutChart';
import { SimpleBarChart } from '@/components/charts/SimpleBarChart';
import { StackedBarChart } from '@/components/charts/StackedBarChart';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { UNMAPPED_COLOR, CATEGORY_LABELS } from '@/lib/normalization/statusNormalizer';
import { computeBacklog, highPriorityRecords } from '@/lib/analytics/priorityAnalytics';
import { assigneePriorityMatrix, calculateAssigneeMetrics } from '@/lib/analytics/assigneeAnalytics';
import { evaluateReleaseCriteria, readinessStatement, REPORT_SECTIONS, type ReportSectionId } from '@/lib/reports/reportTemplates';
import { reportWorkbookTables } from '@/lib/reports/reportWorkbook';
import { workbookBlob } from '@/lib/export/excelExporter';
import { downloadBlob } from '@/lib/export/download';
import { exportFileName } from '@/lib/export/reportExporter';
import { QUALITY_CATEGORIES } from '@/lib/analytics/dataQuality';
import { formatCount, formatDate, formatPercent } from '@/lib/text';
import { cn } from '@/lib/utils';
import { useReportModel } from './reportContext';

const TOP_ASSIGNEES = 20;
const HP_ROWS = 50;
const RISK_ROWS = 10;
const FINDING_ROWS = 50;

function ReportSection({ id, title, children, breakBefore }: { id: ReportSectionId | 'header'; title: string; children: ReactNode; breakBefore: boolean }) {
  return (
    <section className={cn('report-section mt-8', breakBefore && 'print-page-break')} data-report-section={id}>
      <h2 className="mb-3 border-b pb-1 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function T({ head, rows, numeric = [] }: { head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  return (
    <table className="report-table w-full text-sm">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          {head.map((h, i) => (
            <th key={h} className={cn('py-1.5 pr-2 font-medium', numeric.includes(i) ? 'text-right' : 'text-left')}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="tabular">
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b align-top last:border-0">
            {r.map((c, ci) => (
              <td key={ci} className={cn('break-words py-1.5 pr-2', numeric.includes(ci) && 'text-right')}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Print-ready management report. Built in the page from the shared analytics and
 * printed with the browser's own dialog ("Save as PDF") — no server-side conversion.
 */
export function ReportPreview({ onClose }: { onClose: () => void }) {
  const { dataset, analytics } = useDashboard();
  const notify = useToast();
  const { options, sections, ctx, template, limitations } = useReportModel();
  const generated = useMemo(() => new Date(), []);
  const { agg, colors, executive: m, summary, risks, aging, qualityScore: score } = analytics;
  const map = dataset.config.columnMapping;
  const hp = dataset.config.values.highPriority;
  const has = (id: ReportSectionId) => sections.includes(id);
  let sectionCount = 0;
  const brk = () => options.pageBreaks && sectionCount++ > 0;
  const aAgg = ctx.assigneeAgg ?? agg;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const statusItems = agg.byStatus.map((s) => ({ label: s.label, count: s.count, color: colors.status[s.label] ?? UNMAPPED_COLOR }));
  const priorityItems = agg.byPriority.map((p) => ({ label: p.label, value: p.count, color: colors.priority[p.label] ?? UNMAPPED_COLOR }));
  const assigneeRows = calculateAssigneeMetrics(aAgg, hp);
  const topAssignees = aAgg.byAssignee.slice(0, TOP_ASSIGNEES);
  const priorities = agg.byPriority.map((p) => p.label);
  const matrix = assigneePriorityMatrix(aAgg, priorities);
  const backlog = computeBacklog(agg);
  const hpRecords = highPriorityRecords(analytics.scoped, dataset.config.values).filter((r) => r.statusCategory === 'open');
  const registerRecords = ctx.assigneeRecords ?? ctx.records;
  const readiness = evaluateReleaseCriteria(options.releaseCriteria, m);

  const downloadExcel = () => {
    downloadBlob(workbookBlob(reportWorkbookTables(ctx, options, sections)), exportFileName(dataset, `${options.template}-report`, 'xlsx'));
    notify(`${template.title} exported.`);
  };

  return (
    <ScrubOnUnmount className="fixed inset-0 z-40 overflow-y-auto bg-background print:static print:overflow-visible" role="dialog" aria-label="Printable report">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2">
        <p className="text-sm text-muted-foreground">Report preview — use your browser&apos;s print dialog and choose “Save as PDF” to create a PDF.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> Print / Save as PDF
          </Button>
          <Button size="sm" variant="outline" onClick={downloadExcel}>
            <FileSpreadsheet /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            <ArrowLeft /> Back to dashboard (Close)
          </Button>
        </div>
      </div>

      <article className="report mx-auto max-w-[820px] bg-card px-8 py-8 text-card-foreground print:max-w-none print:p-0" data-testid="print-report">
        <header className="border-b pb-4 print-avoid-break">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">QA Issue Analytics</p>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="report-title">
            {template.title}
          </h1>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Generated</dt>
            <dd>{generated.toLocaleString()}</dd>
            <dt className="text-muted-foreground">Source file</dt>
            <dd className="break-words">
              {dataset.file.fileName}
              {dataset.file.kind !== 'csv' ? ` · ${dataset.file.sheetName}` : ''}
            </dd>
            <dt className="text-muted-foreground">Dataset scope</dt>
            <dd>
              {formatCount(m.scopes.inScope)} records in scope · {formatCount(m.scopes.included)} in analytics · {formatCount(m.scopes.valid)} valid of {formatCount(m.scopes.imported)} imported rows
              {m.scopes.excluded > 0 ? ` · ${formatCount(m.scopes.excluded)} excluded by duplicate rule` : ''}
            </dd>
            <dt className="text-muted-foreground">Filters</dt>
            <dd>{analytics.filterDescription || 'None'}</dd>
            {ctx.assigneeRecords && (
              <>
                <dt className="text-muted-foreground">Assignees</dt>
                <dd>{options.assignees.join(', ')}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Sections</dt>
            <dd>{sections.map((id) => REPORT_SECTIONS.find((s) => s.id === id)?.label).join(' · ')}</dd>
          </dl>
          <div className="mt-3 rounded-md border p-2 text-xs" data-testid="report-limitations">
            <p className="font-semibold">Data limitations</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
              {limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </header>

        {has('summary') && (
          <ReportSection id="summary" title="Executive summary and KPIs" breakBefore={brk()}>
            <p className="text-sm leading-relaxed">{summary.headline}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Total issues (scope)', formatCount(m.scopes.inScope)],
                ['Closed', m.statusMapped ? `${formatCount(m.closed.count)} (${formatPercent(m.closed.percent)})` : '—'],
                ['Closure rate (current)', !m.closureRate.configured ? 'Not configured' : `${formatPercent(m.closureRate.percent)}${m.closureRate.provisional ? ' (provisional)' : ''}`],
                ['Open backlog', m.statusMapped ? formatCount(m.openBacklog.count) : '—'],
                [`${m.highPriorityOpen.group.join(' + ') || 'High-priority'} open`, m.highPriorityOpen.configured ? `${formatCount(m.highPriorityOpen.count)} (${m.highPriorityOpen.levels.map((l) => `${l.label} ${l.count}`).join(', ')})` : 'Not configured'],
                ['Reopened (current state)', formatCount(m.reopened.count)],
                ['Ready for QA', formatCount(m.readyForQa.count)],
                ['Unassigned', formatCount(m.unassigned.count)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border p-2 print-avoid-break">
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                  <p className="tabular text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {summary.insights.map((i) => (
                <li key={i.id}>
                  <b>{i.title}:</b> {i.text}
                </li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-muted-foreground">
              {summary.notes.map((n) => (
                <p key={n}>• {n}</p>
              ))}
            </div>
          </ReportSection>
        )}

        {has('readiness') && (
          <ReportSection id="readiness" title="Release readiness indicators" breakBefore={brk()}>
            <p className="mb-2 text-sm font-medium" data-testid="readiness-statement">
              {readinessStatement(readiness)}
            </p>
            {readiness.length > 0 && <T head={['Criterion', 'Actual', 'Limit', 'Result']} numeric={[1, 2]} rows={readiness.map((r) => [r.label, formatCount(r.actual), formatCount(r.limit), r.met ? 'Met' : 'Not met'])} />}
            <T
              head={['Indicator', 'Value']}
              numeric={[1]}
              rows={[
                ['Total issues in scope', formatCount(m.scopes.inScope)],
                ['Closed', formatCount(m.closed.count)],
                ['Open backlog', formatCount(m.openBacklog.count)],
                [`Open high-priority (${m.highPriorityOpen.group.join(', ') || 'not configured'})`, m.highPriorityOpen.configured ? formatCount(m.highPriorityOpen.count) : 'Not configured'],
                ['Reopened (current state)', formatCount(m.reopened.count)],
                ['Ready for QA', formatCount(m.readyForQa.count)],
                ...(m.blocked.mapped ? [['Blocked', formatCount(m.blocked.count)]] : []),
                ...(aging.available ? [[`Open issues older than ${aging.buckets.length > 1 ? aging.buckets[aging.buckets.length - 2].max : 0} days (age since creation)`, formatCount(aging.buckets[aging.buckets.length - 1].indexes.length)]] : []),
                ['Unmapped statuses', formatCount(m.unmappedStatus.count)],
              ]}
            />
          </ReportSection>
        )}

        {has('status') && agg.total > 0 && (
          <ReportSection id="status" title="Status distribution" breakBefore={brk()}>
            <div className="print-avoid-break">
              <StatusDonutChart items={statusItems} total={agg.total} height={400} legendType="plain" ariaLabel="Report: status distribution" />
            </div>
            <T head={['Status', 'Workflow', 'Issues', '% of scope']} numeric={[2, 3]} rows={agg.byStatus.map((s) => [s.label, CATEGORY_LABELS[s.category], formatCount(s.count), formatPercent((s.count / agg.total) * 100)])} />
          </ReportSection>
        )}

        {has('priority') && agg.total > 0 && (
          <ReportSection id="priority" title="Priority-wise analysis" breakBefore={brk()}>
            <div className="print-avoid-break">
              <SimpleBarChart items={priorityItems} total={agg.total} ariaLabel="Report: priority distribution" />
            </div>
            <h3 className="mb-1 mt-4 text-sm font-semibold">Backlog by priority</h3>
            <T head={['Priority', 'Open', 'Closed', 'Unmapped', 'Total']} numeric={[1, 2, 3, 4]} rows={backlog.map((b) => [b.priority, formatCount(b.open), formatCount(b.closed), formatCount(b.unmapped), formatCount(b.total)])} />
            {hp.length > 0 && (
              <>
                <h3 className="mb-1 mt-4 text-sm font-semibold">
                  Open high-priority issues ({formatCount(hpRecords.length)}){hpRecords.length > HP_ROWS ? `, first ${HP_ROWS}` : ''}
                </h3>
                <T head={['ID', 'Title', 'Priority', 'Status', 'Assignee']} rows={hpRecords.slice(0, HP_ROWS).map((r) => [r.id || '—', r.title, r.priority, r.status, r.assignee])} />
              </>
            )}
          </ReportSection>
        )}

        {has('assignee') && aAgg.total > 0 && (
          <ReportSection id="assignee" title="Assignee workload and priority matrix" breakBefore={brk()}>
            <p className="mb-2 text-xs text-muted-foreground">Workload distribution for planning. Issue counts are not a measure of individual performance.</p>
            <T
              head={['Assignee', 'Total', 'Open', 'Closed', ...hp, ...(hp.length > 1 ? [hp.join('+')] : []), 'Reopened', 'Ready for QA']}
              numeric={Array.from({ length: 7 + hp.length }, (_, i) => i + 1)}
              rows={assigneeRows.map((r) => [
                r.isUnassigned ? 'Unassigned (no owner)' : r.name,
                formatCount(r.total),
                formatCount(r.open),
                formatCount(r.closed),
                ...hp.map((p) => formatCount(r.levels[p] ?? 0)),
                ...(hp.length > 1 ? [formatCount(r.highPriority)] : []),
                formatCount(r.reopened),
                formatCount(r.readyForQa),
              ])}
            />
            {map.priority !== null && (
              <>
                <div className="mt-4 print-avoid-break">
                  <StackedBarChart
                    categories={topAssignees.map((a) => a.name)}
                    series={priorities.map((p) => ({ name: p, color: colors.priority[p] ?? UNMAPPED_COLOR, values: topAssignees.map((a) => a.byPriority[p] ?? 0) }))}
                    ariaLabel="Report: assignee by priority"
                    labelWidth={150}
                  />
                </div>
                <h3 className="mb-1 mt-4 text-sm font-semibold">Assignee-priority matrix</h3>
                <T
                  head={['Assignee', ...priorities, 'Total']}
                  numeric={Array.from({ length: priorities.length + 1 }, (_, i) => i + 1)}
                  rows={[...matrix.rows.map((r) => [r.assignee, ...r.cells.map((c) => (c ? formatCount(c) : '·')), formatCount(r.total)]), ['Total', ...matrix.columnTotals.map(formatCount), formatCount(matrix.grandTotal)]]}
                />
              </>
            )}
            {aAgg.byAssignee.length > TOP_ASSIGNEES && map.priority !== null && <p className="mt-1 text-xs text-muted-foreground">Chart shows the top {TOP_ASSIGNEES} of {aAgg.byAssignee.length} assignees; the tables list all.</p>}
          </ReportSection>
        )}

        {has('risks') && (
          <ReportSection id="risks" title="Risks and attention items" breakBefore={brk()}>
            <p className="mb-2 text-xs text-muted-foreground">Attention indicators from explicit rules — not evidence of missed deadlines or delivery failure.</p>
            {risks.map((r) => (
              <div key={r.id} className="mb-3 rounded-md border p-3 print-avoid-break">
                <p className="text-sm font-semibold">
                  {r.rank}. {r.category}: {r.title} — {r.available ? formatCount(r.count) : 'unavailable'}
                </p>
                <p className="text-xs">{r.explanation}</p>
                <p className="mt-1 text-xs text-muted-foreground">Rule: {r.rule}</p>
                {r.limitations.length > 0 && <p className="text-xs text-muted-foreground">Limitations: {r.limitations.join(' ')}</p>}
                {r.available && r.count > 0 && (
                  <p className="mt-1 text-xs">
                    {r.breakdowns
                      .filter((b) => b.rows.length)
                      .map((b) => `${b.title}: ${b.rows.slice(0, 6).map((x) => `${x.label} ${x.count}`).join(', ')}`)
                      .join(' · ')}
                  </p>
                )}
                {r.available && r.indexes.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Issues: {r.indexes.slice(0, RISK_ROWS).map((i) => dataset.records[i].id || `row ${dataset.records[i].sourceRow}`).join(', ')}
                    {r.indexes.length > RISK_ROWS ? ` +${r.indexes.length - RISK_ROWS} more` : ''}
                  </p>
                )}
              </div>
            ))}
          </ReportSection>
        )}

        {has('aging') && (
          <ReportSection id="aging" title="Aging analysis (age since creation)" breakBefore={brk()}>
            <p className="mb-2 text-xs text-muted-foreground">Open issues only, as of {aging.referenceDate.toLocaleDateString()}. This is age since creation, not time in the current workflow state.</p>
            <T
              head={['Age', 'Open issues']}
              numeric={[1]}
              rows={[
                ...aging.buckets.map((b) => [b.label, formatCount(b.indexes.length)]),
                ['No Created Date', formatCount(aging.missingCreated.length)],
                ['Unreadable Created Date', formatCount(aging.invalidCreated.length)],
                ['Created Date in the future', formatCount(aging.futureCreated.length)],
              ]}
            />
          </ReportSection>
        )}

        {has('quality') && (
          <ReportSection id="quality" title="Data quality" breakBefore={brk()}>
            <p className="text-sm">
              Data-quality score: <b>{score.overall === null ? 'N/A' : `${score.overall.toFixed(1)} / 100`}</b> — {score.passed} rules passed, {score.warnings} warnings, {score.errors} errors, {score.notApplicable} not applicable. Method: share of
              valid records per rule, weighted; pass ≥ 98 %, warning ≥ 90 %.
            </p>
            <T head={['Rule', 'Outcome', 'Score', 'Valid / checked']} numeric={[2, 3]} rows={score.dimensions.map((d) => [d.label, d.outcome, d.score === null ? '—' : formatPercent(d.score), d.score === null ? '—' : `${formatCount(d.valid)} / ${formatCount(d.checked)}`])} />
            <h3 className="mb-1 mt-4 text-sm font-semibold">Findings by category</h3>
            <T head={['Category', 'Findings']} numeric={[1]} rows={QUALITY_CATEGORIES.filter((c) => dataset.quality.countsByCategory[c] > 0).map((c) => [c, formatCount(dataset.quality.countsByCategory[c])])} />
            {dataset.quality.issues.length > 0 && (
              <>
                <h3 className="mb-1 mt-4 text-sm font-semibold">
                  Findings{dataset.quality.issues.length > FINDING_ROWS ? ` (first ${FINDING_ROWS} of ${formatCount(dataset.quality.issues.length)}; all in the Excel report)` : ''}
                </h3>
                <T head={['Row', 'ID', 'Category', 'Severity', 'Problem']} numeric={[0]} rows={dataset.quality.issues.slice(0, FINDING_ROWS).map((i) => [i.sourceRow, i.issueId || '—', i.category, i.severity, i.explanation])} />
              </>
            )}
          </ReportSection>
        )}

        {has('comparison') && ctx.comparison && (
          <ReportSection id="comparison" title={`Snapshot comparison (previous: ${ctx.comparison.previousName})`} breakBefore={brk()}>
            <T
              head={['Metric', 'Previous', 'Current', 'Change', '% change']}
              numeric={[1, 2, 3, 4]}
              rows={ctx.comparison.result.metrics.map((x) => [x.metric, formatCount(x.previous), formatCount(x.current), x.change > 0 ? `+${formatCount(x.change)}` : formatCount(x.change), x.percentChange === null ? '—' : formatPercent(x.percentChange)])}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Newly observed IDs: {formatCount(ctx.comparison.result.newlyObserved.length)} (not necessarily new issues) · No longer present in the export: {formatCount(ctx.comparison.result.noLongerPresent.length)} (not necessarily deleted) · Status changes:{' '}
              {formatCount(ctx.comparison.result.statusChanges.length)} · Priority changes: {formatCount(ctx.comparison.result.priorityChanges.length)} · Assignee changes: {formatCount(ctx.comparison.result.assigneeChanges.length)}
            </p>
          </ReportSection>
        )}

        {has('register') && (
          <ReportSection id="register" title={`Detailed issue register (${formatCount(registerRecords.length)})`} breakBefore={brk()}>
            {registerRecords.length > options.registerLimit && (
              <p className="mb-2 text-xs text-muted-foreground">
                Showing the first {formatCount(options.registerLimit)} of {formatCount(registerRecords.length)} records; the Excel report contains all of them.
              </p>
            )}
            <T
              head={['Row', 'ID', 'Title', 'Status', 'Priority', 'Assignee', ...(map.created !== null ? ['Created'] : [])]}
              numeric={[0]}
              rows={registerRecords.slice(0, options.registerLimit).map((r) => [r.sourceRow, r.id || '—', r.title, r.status, r.priority, r.isUnassigned ? 'Unassigned' : r.assignee, ...(map.created !== null ? [formatDate(r.created)] : [])])}
            />
          </ReportSection>
        )}

        {sections.length === 0 && <p className="mt-8 text-sm text-muted-foreground">No sections selected. Return to the dashboard and choose report sections.</p>}

        <footer className="mt-10 border-t pt-3 text-xs text-muted-foreground">
          Generated locally in the browser by QA Issue Analytics Dashboard on {generated.toLocaleString()}. The source file was not uploaded to any server.
        </footer>
      </article>
    </ScrubOnUnmount>
  );
}
