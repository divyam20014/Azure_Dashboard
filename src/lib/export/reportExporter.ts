import type { IssueRecord } from '@/types/issue';
import type { Aggregates, Dataset } from '@/types/analytics';
import type { ExecutiveSummary } from '@/lib/analytics/summaryGenerator';
import { fileStem, todayStamp } from '@/lib/text';
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
  type ReportTable,
} from './reportTables';

export interface ExportContext {
  dataset: Dataset;
  /** Aggregates for the current analytics scope (counting rule + global filters). */
  agg: Aggregates;
  /** Records currently shown in the issue register (scope + chart selection + search). */
  registerRecords: IssueRecord[];
  summary: ExecutiveSummary;
}

/** Worksheets for the full Excel report; tables that need unmapped fields are left out. */
export function workbookTables(ctx: ExportContext): ReportTable[] {
  const m = ctx.dataset.config.columnMapping;
  const tables: ReportTable[] = [
    executiveSummaryTable(ctx.summary, { fileName: ctx.dataset.file.fileName, records: ctx.agg.total, generatedAt: new Date() }),
  ];
  if (m.status !== null) tables.push(statusSummaryTable(ctx.agg));
  if (m.priority !== null) tables.push(prioritySummaryTable(ctx.agg));
  if (m.assignee !== null) tables.push(assigneeSummaryTable(ctx.agg, ctx.dataset.config.values.highPriority));
  if (m.assignee !== null && m.priority !== null) tables.push(assigneePriorityTable(ctx.agg));
  if (m.assignee !== null && m.status !== null) tables.push(assigneeStatusTable(ctx.agg));
  tables.push(issueRegisterTable(ctx.registerRecords, ctx.dataset, 'Filtered Issue Register'));
  tables.push(dataQualitySummaryTable(ctx.dataset.quality));
  tables.push(dataQualityTable(ctx.dataset.quality));
  return tables;
}

export function exportFileName(dataset: Dataset, suffix: string, ext: string): string {
  return `${fileStem(dataset.file.fileName)}-${suffix}-${todayStamp()}.${ext}`;
}
