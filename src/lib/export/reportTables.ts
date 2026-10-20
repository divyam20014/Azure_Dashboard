import type { IssueRecord } from '@/types/issue';
import type { Aggregates, Dataset } from '@/types/analytics';
import { FIELD_LABELS, type LogicalField } from '@/types/mappings';
import { cellToString, percentOf } from '@/lib/text';
import { CATEGORY_LABELS } from '@/lib/normalization/statusNormalizer';
import { computeBacklog } from '@/lib/analytics/priorityAnalytics';
import { assigneePriorityMatrix, calculateAssigneeMetrics, type MatrixMode } from '@/lib/analytics/assigneeAnalytics';
import type { DataQualityReport } from '@/lib/analytics/dataQuality';
import type { ExecutiveSummary } from '@/lib/analytics/summaryGenerator';

export type ColumnKind = 'text' | 'int' | 'pct' | 'date';
export type ReportCell = string | number | Date | null;

export interface ReportColumn {
  header: string;
  kind: ColumnKind;
}

/** A format-neutral table rendered by both the CSV and Excel exporters. Percent cells are fractions (0..1). */
export interface ReportTable {
  name: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
}

const text = (header: string): ReportColumn => ({ header, kind: 'text' });
const int = (header: string): ReportColumn => ({ header, kind: 'int' });
const pctCol = (header: string): ReportColumn => ({ header, kind: 'pct' });

function fraction(count: number, total: number): number | null {
  const p = percentOf(count, total);
  return p === null ? null : p / 100;
}

export function statusSummaryTable(agg: Aggregates): ReportTable {
  return {
    name: 'Status Summary',
    columns: [text('Status'), text('Workflow Category'), int('Issues'), pctCol('% of Total')],
    rows: agg.byStatus.map((s) => [s.label, CATEGORY_LABELS[s.category], s.count, fraction(s.count, agg.total)]),
  };
}

export function prioritySummaryTable(agg: Aggregates): ReportTable {
  const backlog = new Map(computeBacklog(agg).map((b) => [b.priority, b]));
  return {
    name: 'Priority Summary',
    columns: [text('Priority'), int('Issues'), pctCol('% of Total'), int('Open'), int('Closed'), int('Unmapped Status')],
    rows: agg.byPriority.map((p) => {
      const b = backlog.get(p.label);
      return [p.label, p.count, fraction(p.count, agg.total), b?.open ?? 0, b?.closed ?? 0, b?.unmapped ?? 0];
    }),
  };
}

/**
 * Per-assignee workload. The first six columns are unchanged from earlier versions; the
 * high-priority, reopened, ready-for-QA and open-share columns follow.
 */
export function assigneeSummaryTable(agg: Aggregates, highPriority: string[] = []): ReportTable {
  const rows = calculateAssigneeMetrics(agg, highPriority);
  return {
    name: 'Assignee Summary',
    columns: [
      text('Assignee'),
      int('Total Issues'),
      pctCol('% of Total'),
      int('Open'),
      int('Closed'),
      int('Unmapped Status'),
      ...highPriority.map((p) => int(`${p} Issues`)),
      ...(highPriority.length > 1 ? [int(`${highPriority.join(' + ')} Issues`)] : []),
      int('Reopened'),
      int('Ready for QA'),
      pctCol('% of Open Backlog'),
    ],
    rows: rows.map((a) => [
      a.name,
      a.total,
      fraction(a.total, agg.total),
      a.open,
      a.closed,
      a.unmapped,
      ...highPriority.map((p) => a.levels[p] ?? 0),
      ...(highPriority.length > 1 ? [a.highPriority] : []),
      a.reopened,
      a.readyForQa,
      a.shareOfOpen === null ? null : a.shareOfOpen / 100,
    ]),
  };
}

export function assigneePriorityTable(agg: Aggregates, mode: MatrixMode = 'all'): ReportTable {
  const priorities = agg.byPriority.map((p) => p.label);
  const matrix = assigneePriorityMatrix(agg, priorities, mode);
  return {
    name: mode === 'open' ? 'Assignee-Priority (Open)' : 'Assignee-Priority Matrix',
    columns: [text('Assignee'), ...priorities.map(int), int('Total')],
    rows: [...matrix.rows.map((r) => [r.assignee, ...r.cells, r.total]), ['Total', ...matrix.columnTotals, matrix.grandTotal]],
  };
}

export function assigneeStatusTable(agg: Aggregates): ReportTable {
  const statuses = agg.byStatus.map((s) => s.label);
  return {
    name: 'Assignee-Status Summary',
    columns: [text('Assignee'), ...statuses.map(int), int('Total')],
    rows: agg.byAssignee.map((a) => [a.name, ...statuses.map((s) => a.byStatus[s] ?? 0), a.total]),
  };
}

const ISSUE_FIELDS: { field: LogicalField; value: (r: IssueRecord) => ReportCell; kind: ColumnKind }[] = [
  { field: 'id', value: (r) => r.id, kind: 'text' },
  { field: 'title', value: (r) => r.title, kind: 'text' },
  { field: 'status', value: (r) => r.status, kind: 'text' },
  { field: 'priority', value: (r) => r.priority, kind: 'text' },
  { field: 'assignee', value: (r) => r.assignee, kind: 'text' },
  { field: 'type', value: (r) => r.type, kind: 'text' },
  { field: 'severity', value: (r) => r.severity, kind: 'text' },
  { field: 'project', value: (r) => r.project, kind: 'text' },
  { field: 'area', value: (r) => r.area, kind: 'text' },
  { field: 'iteration', value: (r) => r.iteration, kind: 'text' },
  { field: 'created', value: (r) => r.created, kind: 'date' },
  { field: 'updated', value: (r) => r.updated, kind: 'date' },
  { field: 'closed', value: (r) => r.closed, kind: 'date' },
];

/**
 * Issue register export: normalized fields that are mapped, workflow category,
 * the original status/priority values, then every original source column.
 */
export function issueRegisterTable(records: IssueRecord[], dataset: Dataset, name = 'Issue Register'): ReportTable {
  const mapping = dataset.config.columnMapping;
  const fields = ISSUE_FIELDS.filter((f) => mapping[f.field] !== null);
  const columns: ReportColumn[] = [int('Source Row'), ...fields.map((f) => ({ header: FIELD_LABELS[f.field], kind: f.kind }))];
  const extras: { header: string; value: (r: IssueRecord) => ReportCell }[] = [];
  if (mapping.status !== null) {
    extras.push({ header: 'Workflow Category', value: (r) => CATEGORY_LABELS[r.statusCategory] });
    extras.push({ header: 'Original Status', value: (r) => r.statusRaw });
  }
  if (mapping.priority !== null) extras.push({ header: 'Original Priority', value: (r) => r.priorityRaw });
  if (mapping.id !== null) extras.push({ header: 'Duplicate ID', value: (r) => (r.isDuplicateId ? 'Yes' : 'No') });
  columns.push(...extras.map((e) => text(e.header)));
  columns.push(...dataset.headers.map((h) => text(`Source: ${h}`)));

  const rows = records.map((r) => [
    r.sourceRow,
    ...fields.map((f) => f.value(r)),
    ...extras.map((e) => e.value(r)),
    ...dataset.headers.map((_, i) => cellToString(r.cells[i] ?? null)),
  ]);
  return { name, columns, rows };
}

export function dataQualityTable(quality: DataQualityReport): ReportTable {
  return {
    name: 'Data Quality Report',
    columns: [int('Source Row'), text('Issue ID'), text('Validation Category'), text('Explanation'), text('Severity'), text('Recommended Correction')],
    rows: quality.issues.map((i) => [i.sourceRow, i.issueId, i.category, i.explanation, i.severity, i.recommendation]),
  };
}

export function dataQualitySummaryTable(quality: DataQualityReport): ReportTable {
  const rows: ReportCell[][] = [
    ['Total imported rows', quality.totalImportedRows],
    ['Blank rows', quality.blankRows],
    ['Valid issue records', quality.validRecords],
    ['Missing issue IDs', quality.missingIds],
    ['Records with duplicate issue IDs', quality.duplicateIdRecords],
    ['Distinct duplicated IDs', quality.duplicateIdValues],
    ['Missing statuses', quality.missingStatuses],
    ['Missing assignees', quality.missingAssignees],
    ['Missing priorities', quality.missingPriorities],
    ['Records with invalid dates', quality.invalidDates],
    ['Records with future dates', quality.futureDates],
    ['Records with unmapped statuses', quality.unmappedStatusRecords],
    ['Records with unmapped priorities', quality.unmappedPriorityRecords],
    ['Unrecognized (unmapped) columns', quality.unrecognizedColumns.length],
    ['Duplicate column headers', quality.duplicateHeaders.length],
  ];
  return { name: 'Data Quality Summary', columns: [text('Check'), int('Count')], rows };
}

export function executiveSummaryTable(summary: ExecutiveSummary, meta: { fileName: string; records: number; generatedAt: Date }): ReportTable {
  const rows: ReportCell[][] = [
    ['Report', 'QA Issue Analytics Dashboard'],
    ['Source file', meta.fileName],
    ['Generated', meta.generatedAt.toLocaleString()],
    ['Records in scope', meta.records],
    ['Summary', summary.headline],
    ...summary.insights.map((i) => [i.title, i.text] as ReportCell[]),
    ...summary.notes.map((note) => ['Counting rule', note] as ReportCell[]),
  ];
  return { name: 'Executive Summary', columns: [text('Item'), text('Detail')], rows };
}
