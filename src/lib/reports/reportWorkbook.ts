import type { IssueRecord } from '@/types/issue';
import type { Aggregates, Dataset } from '@/types/analytics';
import type { ExecutiveMetrics } from '@/lib/analytics/executiveMetrics';
import type { RiskIndicator, AgingResult } from '@/lib/analytics/riskAnalytics';
import type { DataQualityScore } from '@/lib/analytics/dataQualityScore';
import type { SnapshotComparison } from '@/lib/analytics/snapshotComparison';
import type { ExecutiveSummary } from '@/lib/analytics/summaryGenerator';
import { percentOf } from '@/lib/text';
import {
  assigneePriorityTable,
  assigneeStatusTable,
  assigneeSummaryTable,
  dataQualitySummaryTable,
  dataQualityTable,
  executiveSummaryTable,
  issueRegisterTable,
  prioritySummaryTable,
  statusSummaryTable,
  type ReportCell,
  type ReportColumn,
  type ReportTable,
} from '@/lib/export/reportTables';
import { evaluateReleaseCriteria, readinessStatement, REPORT_TEMPLATES, type ReportOptions, type ReportSectionId } from './reportTemplates';

const text = (header: string): ReportColumn => ({ header, kind: 'text' });
const int = (header: string): ReportColumn => ({ header, kind: 'int' });
const pct = (header: string): ReportColumn => ({ header, kind: 'pct' });
const frac = (p: number | null): number | null => (p === null ? null : p / 100);

export function kpiDetailsTable(m: ExecutiveMetrics): ReportTable {
  const s = m.scopes;
  const row = (kpi: string, value: number | null, share: number | null, scope: string, definition: string): ReportCell[] => [kpi, value, frac(share), scope, definition];
  const rows: ReportCell[][] = [
    row('Imported rows', s.imported, null, 'File', 'Data rows below the header, blank rows included.'),
    row('Valid records', s.valid, null, 'File', 'Non-blank rows normalized into issue records.'),
    row('Excluded by duplicate rule', s.excluded, null, 'Analytics', 'Records left out by the duplicate-handling configuration.'),
    row('Records in analytics', s.included, null, 'Analytics', 'Records counted after the duplicate rule.'),
    row('Records in current scope', s.inScope, null, 'Filtered', 'Records matching the active global filters; all KPIs below use this scope.'),
    row('Closed issues', m.closed.count, m.closed.percent, 'Filtered', `Workflow category Closed. Statuses: ${m.closed.statuses.join(', ') || 'none configured'}.`),
    row(
      'Closure rate (current state)',
      null,
      m.closureRate.percent,
      'Filtered',
      m.closureRate.configured ? `Closed ÷ in-scope total.${m.closureRate.provisional ? ` Provisional: ${m.closureRate.unmapped} record(s) have unmapped statuses.` : ''}` : 'Not configured: no status is classified as Closed.',
    ),
    row('Open backlog', m.openBacklog.count, m.openBacklog.percent, 'Filtered', `Workflow category Open / Pending. Statuses: ${m.openBacklog.statuses.join(', ') || 'none configured'}.`),
    ...m.highPriorityOpen.levels.map((l) => row(`${l.label} open`, l.count, percentOf(l.count, s.inScope), 'Filtered', `Priority ${l.label}, workflow category Open / Pending.`)),
    row(
      `High-priority open (${m.highPriorityOpen.group.join(' + ') || 'not configured'})`,
      m.highPriorityOpen.configured ? m.highPriorityOpen.count : null,
      m.highPriorityOpen.configured ? m.highPriorityOpen.percent : null,
      'Filtered',
      m.highPriorityOpen.configured ? 'Open issues in the configured high-priority group.' : 'Not configured.',
    ),
    row('Reopened (current state)', m.reopened.count, m.reopened.percent, 'Filtered', m.reopened.mapped ? 'Records currently in the Reopened state — not a count of historical reopen events.' : 'No status is mapped to Reopened.'),
    row('Ready for QA', m.readyForQa.count, m.readyForQa.percent, 'Filtered', m.readyForQa.mapped ? 'Records currently in the Ready for QA state.' : 'No status is mapped to Ready for QA.'),
    row('Unassigned', m.unassigned.count, m.unassigned.percent, 'Filtered', 'Blank, whitespace or placeholder assignee.'),
    row('Unmapped status', m.unmappedStatus.count, m.unmappedStatus.percent, 'Filtered', `Not counted as open or closed. Values: ${m.unmappedStatus.values.join(', ') || 'none'}.`),
  ];
  if (m.blocked.mapped) rows.push(row('Blocked', m.blocked.count, m.blocked.percent, 'Filtered', 'Records whose normalized status is Blocked.'));
  return { name: 'KPI Details', columns: [text('KPI'), int('Value'), pct('% of Scope'), text('Scope'), text('Definition')], rows };
}

export function riskItemsTable(risks: RiskIndicator[]): ReportTable {
  return {
    name: 'Risk and Attention Items',
    columns: [text('Attention Category'), text('Indicator'), int('Affected Issues'), text('Available'), text('Rule'), text('Explanation'), text('Limitations')],
    rows: risks.map((r) => [r.category, r.title, r.available ? r.count : null, r.available ? 'Yes' : 'No', r.rule, r.explanation, r.limitations.join(' ') || '—']),
  };
}

/** Every record behind every risk indicator, one row per (indicator, record). */
export function riskRecordsTable(risks: RiskIndicator[], records: IssueRecord[]): ReportTable {
  const byIndex = new Map(records.map((r) => [r.index, r]));
  const rows: ReportCell[][] = [];
  for (const risk of risks) {
    if (!risk.available) continue;
    for (const i of risk.indexes) {
      const r = byIndex.get(i);
      if (r) rows.push([risk.title, r.sourceRow, r.id, r.title, r.status, r.priority, r.assignee, r.created]);
    }
  }
  return {
    name: 'Risk Records',
    columns: [text('Indicator'), int('Source Row'), text('Issue ID'), text('Title'), text('Status'), text('Priority'), text('Assignee'), { header: 'Created Date', kind: 'date' }],
    rows,
  };
}

export function agingTable(aging: AgingResult): ReportTable {
  const rows: ReportCell[][] = aging.buckets.map((b) => [b.label, b.indexes.length, frac(percentOf(b.indexes.length, aging.aged))]);
  rows.push(['Open, no Created Date', aging.missingCreated.length, null]);
  rows.push(['Open, unreadable Created Date', aging.invalidCreated.length, null]);
  rows.push(['Open, Created Date in the future', aging.futureCreated.length, null]);
  return { name: 'Aging (Age Since Creation)', columns: [text(`Age as of ${aging.referenceDate.toLocaleDateString()}`), int('Open Issues'), pct('% of Aged')], rows };
}

export function qualityScoreTable(score: DataQualityScore): ReportTable {
  return {
    name: 'Data Quality Score',
    columns: [text('Rule'), text('Outcome'), int('Weight'), pct('Score'), int('Valid Records'), int('Records Checked'), text('Method / Note')],
    rows: [
      ['Overall score (weighted)', score.overall === null ? 'Insufficient data' : `${score.passed} passed, ${score.warnings} warnings, ${score.errors} errors`, null, frac(score.overall), null, score.recordsChecked, 'Weight-averaged over applicable rules. Pass ≥ 98 %, warning ≥ 90 %.'],
      ...score.dimensions.map((d) => [d.label, d.outcome, d.weight, frac(d.score), d.score === null ? null : d.valid, d.score === null ? null : d.checked, d.note ?? d.description] as ReportCell[]),
    ],
  };
}

export function comparisonTables(c: SnapshotComparison, previousName: string, currentName: string): ReportTable[] {
  const metrics: ReportTable = {
    name: 'Comparison Summary',
    columns: [text('Metric'), int(`Previous (${previousName})`.slice(0, 60)), int(`Current (${currentName})`.slice(0, 60)), int('Change'), pct('% Change')],
    rows: [
      ...c.metrics.map((m) => [m.metric, m.previous, m.current, m.change, frac(m.percentChange)] as ReportCell[]),
      ['Matched issue IDs', null, c.matched, null, null],
      ['Newly observed IDs (not necessarily new issues)', null, c.newlyObserved.length, null, null],
      ['IDs no longer present in the export (not necessarily deleted)', c.noLongerPresent.length, null, null, null],
      ['Status changes', null, c.statusChanges.length, null, null],
      ['Priority changes', null, c.priorityChanges.length, null, null],
      ['Assignee changes', null, c.assigneeChanges.length, null, null],
      ['Moved to Closed between snapshots', null, c.closedBetween.length, null, null],
      ['Moved from Closed back to Open between snapshots', null, c.reopenedBetween.length, null, null],
    ],
  };
  const changes: ReportTable = {
    name: 'Comparison Changes',
    columns: [text('Issue ID'), text('Title'), text('Change'), text('Previous'), text('Current')],
    rows: [
      ...c.statusChanges.map((x) => [x.id, x.title, 'Status', x.previous, x.current] as ReportCell[]),
      ...c.priorityChanges.map((x) => [x.id, x.title, 'Priority', x.previous, x.current] as ReportCell[]),
      ...c.assigneeChanges.map((x) => [x.id, x.title, 'Assignee', x.previous, x.current] as ReportCell[]),
      ...c.newlyObserved.map((r) => [r.id, r.title, 'Newly observed', '', r.status] as ReportCell[]),
      ...c.noLongerPresent.map((r) => [r.id, r.title, 'No longer present in the export', r.status, ''] as ReportCell[]),
    ],
  };
  return [metrics, changes];
}

export function readinessTable(options: ReportOptions, metrics: ExecutiveMetrics): ReportTable {
  const results = evaluateReleaseCriteria(options.releaseCriteria, metrics);
  return {
    name: 'Release Readiness',
    columns: [text('Criterion'), int('Actual'), int('Limit'), text('Result')],
    rows: [...results.map((r) => [r.label, r.actual, r.limit, r.met ? 'Met' : 'Not met'] as ReportCell[]), ['Statement', null, null, readinessStatement(results)]],
  };
}

export interface ReportContext {
  dataset: Dataset;
  agg: Aggregates;
  executive: ExecutiveMetrics;
  summary: ExecutiveSummary;
  risks: RiskIndicator[];
  aging: AgingResult;
  qualityScore: DataQualityScore;
  /** Records in the report scope (global filters). */
  records: IssueRecord[];
  /** Workload report: the per-assignee aggregates for the selected assignees. */
  assigneeAgg?: Aggregates;
  assigneeRecords?: IssueRecord[];
  comparison: { result: SnapshotComparison; previousName: string } | null;
  filterDescription: string;
}

/** Worksheets for a management report, limited to the given (already-available) sections. */
export function reportWorkbookTables(ctx: ReportContext, options: ReportOptions, sections: ReportSectionId[]): ReportTable[] {
  const has = (id: ReportSectionId) => sections.includes(id);
  const template = REPORT_TEMPLATES[options.template];
  const hp = ctx.dataset.config.values.highPriority;
  const tables: ReportTable[] = [];
  const summary = executiveSummaryTable(ctx.summary, { fileName: ctx.dataset.file.fileName, records: ctx.agg.total, generatedAt: new Date() });
  summary.rows.splice(1, 0, ['Template', template.title], ['Sections', sections.join(', ')], ['Filters', ctx.filterDescription || 'None']);
  tables.push(summary);
  if (has('summary') || has('readiness')) tables.push(kpiDetailsTable(ctx.executive));
  if (has('readiness')) tables.push(readinessTable(options, ctx.executive));
  if (has('status')) tables.push(statusSummaryTable(ctx.agg));
  if (has('priority')) tables.push(prioritySummaryTable(ctx.agg));
  if (has('assignee')) {
    const agg = ctx.assigneeAgg ?? ctx.agg;
    tables.push(assigneeSummaryTable(agg, hp));
    if (ctx.dataset.config.columnMapping.priority !== null) {
      tables.push(assigneePriorityTable(agg));
      tables.push(assigneePriorityTable(agg, 'open'));
    }
    if (ctx.dataset.config.columnMapping.status !== null) tables.push(assigneeStatusTable(agg));
  }
  if (has('risks')) {
    tables.push(riskItemsTable(ctx.risks));
    tables.push(riskRecordsTable(ctx.risks, ctx.records));
  }
  if (has('aging')) tables.push(agingTable(ctx.aging));
  if (has('quality')) {
    tables.push(qualityScoreTable(ctx.qualityScore));
    tables.push(dataQualitySummaryTable(ctx.dataset.quality));
    tables.push(dataQualityTable(ctx.dataset.quality));
  }
  if (has('comparison') && ctx.comparison) tables.push(...comparisonTables(ctx.comparison.result, ctx.comparison.previousName, ctx.dataset.file.fileName));
  if (has('register')) tables.push(issueRegisterTable(ctx.assigneeRecords ?? ctx.records, ctx.dataset, 'Detailed Issue Register'));
  return tables;
}
