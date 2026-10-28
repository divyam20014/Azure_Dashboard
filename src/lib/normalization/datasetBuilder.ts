import type { CellValue, DateField, IssueRecord, ParsedFile } from '@/types/issue';
import { NO_PRIORITY_LABEL, NO_STATUS_LABEL, UNKNOWN_PRIORITY_LABEL } from '@/types/issue';
import type { ColumnMapping, DateOrder, LogicalField, SetupConfig, ValueMappings } from '@/types/mappings';
import type { Dataset } from '@/types/analytics';
import { cellToString, cleanText, isBlankCell, normKey } from '@/lib/text';
import { computeDataQuality } from '@/lib/analytics/dataQuality';
import { buildHeaders, detectColumns, detectHeaderRow, tableWidth } from './columnDetector';
import { buildStatusRules, buildStatusColors, type DistinctValue } from './statusNormalizer';
import { buildPriorityRules, defaultHighPriority, mergePriorityOrder } from './priorityNormalizer';
import { assigneeLabel, buildAssigneeRules } from './assigneeNormalizer';
import { parseDateCell } from './dateParser';

export interface SourceTable {
  headers: string[];
  duplicateHeaders: string[];
  /** Rows below the header row (blank rows included). */
  dataRows: CellValue[][];
  /** 1-based source row number of dataRows[0]. */
  firstDataRowNumber: number;
}

export function sliceSource(file: ParsedFile, headerRowIndex: number): SourceTable {
  const width = tableWidth(file.rows, headerRowIndex);
  const { headers, duplicates } = buildHeaders(file.rows[headerRowIndex], width);
  return {
    headers,
    duplicateHeaders: duplicates,
    dataRows: file.rows.slice(headerRowIndex + 1),
    firstDataRowNumber: file.firstRowNumber + headerRowIndex + 1,
  };
}

function isBlankRow(row: CellValue[] | undefined): boolean {
  return !row || row.every((c) => isBlankCell(c));
}

/** Categorical values (status, assignee, IDs…): trimmed with internal whitespace collapsed. */
function textAt(row: CellValue[], col: number | null): string {
  return col === null ? '' : cleanText(cellToString(row[col] ?? null));
}

/** Free text (titles): only trimmed, so line breaks and spacing are kept exactly as imported. */
function freeTextAt(row: CellValue[], col: number | null): string {
  return col === null ? '' : cellToString(row[col] ?? null).trim();
}

/** Distinct values of one column, grouped case/whitespace-insensitively, most frequent first. */
export function collectDistinct(rows: CellValue[][], col: number | null): DistinctValue[] {
  if (col === null) return [];
  const map = new Map<string, DistinctValue>();
  for (const row of rows) {
    if (isBlankRow(row)) continue;
    const text = textAt(row, col);
    const key = normKey(text);
    const entry = map.get(key);
    if (entry) entry.count++;
    else map.set(key, { key, sourceLabel: text, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.sourceLabel.localeCompare(b.sourceLabel));
}

/** Build (or refresh) value mappings for the current column mapping, keeping prior user edits. */
export function buildValueMappings(table: SourceTable, mapping: ColumnMapping, previous?: ValueMappings): ValueMappings {
  const status = buildStatusRules(collectDistinct(table.dataRows, mapping.status), previous?.status);
  const priority = buildPriorityRules(collectDistinct(table.dataRows, mapping.priority), previous?.priority);
  const assignee = buildAssigneeRules(collectDistinct(table.dataRows, mapping.assignee), previous?.assignee);
  const priorityLabels = Object.values(priority).map((r) => r.label);
  const priorityOrder = mergePriorityOrder(priorityLabels, previous?.priorityOrder);
  const highPriority = previous ? previous.highPriority.filter((l) => priorityOrder.includes(l)) : defaultHighPriority(priorityOrder);
  const statusLabels = [...new Set(Object.values(status).map((r) => r.label))];
  return {
    status,
    priority,
    priorityOrder,
    highPriority: previous && highPriority.length === 0 ? defaultHighPriority(priorityOrder) : highPriority,
    assignee,
    statusColors: buildStatusColors(statusLabels, previous?.statusColors),
  };
}

/** Initial setup for a freshly parsed sheet: header detection, column detection and default value rules. */
export function initialSetup(file: ParsedFile, dateOrder: DateOrder = 'MDY', headerRowIndex?: number): SetupConfig {
  const headerIdx = headerRowIndex ?? detectHeaderRow(file.rows);
  const table = sliceSource(file, headerIdx);
  const columnMapping = detectColumns(table.headers);
  return {
    sheetName: file.sheetName,
    headerRowIndex: headerIdx,
    columnMapping,
    values: buildValueMappings(table, columnMapping),
    dateOrder,
  };
}

/**
 * Setup for a comparison snapshot: reuse the reference dataset's mapping by header name
 * (falling back to automatic detection for fields whose column is not found) and its
 * value rules, so both snapshots are normalized the same way.
 */
export function comparisonSetup(file: ParsedFile, reference: { headers: string[]; config: SetupConfig }): SetupConfig {
  const headerIdx = detectHeaderRow(file.rows);
  const table = sliceSource(file, headerIdx);
  const detected = detectColumns(table.headers);
  const byName = new Map(table.headers.map((h, i) => [h.toLowerCase(), i]));
  const columnMapping = { ...detected };
  const used = new Set<number>();
  for (const field of Object.keys(columnMapping) as LogicalField[]) {
    const refCol = reference.config.columnMapping[field];
    const name = refCol === null ? undefined : reference.headers[refCol]?.toLowerCase();
    const match = name !== undefined ? byName.get(name) : undefined;
    columnMapping[field] = match ?? null;
    if (match !== undefined) used.add(match);
  }
  for (const field of Object.keys(columnMapping) as LogicalField[]) {
    if (columnMapping[field] === null && reference.config.columnMapping[field] !== null && detected[field] !== null && !used.has(detected[field]!)) {
      columnMapping[field] = detected[field];
      used.add(detected[field]!);
    }
  }
  return {
    sheetName: file.sheetName,
    headerRowIndex: headerIdx,
    columnMapping,
    values: buildValueMappings(table, columnMapping, reference.config.values),
    dateOrder: reference.config.dateOrder,
  };
}

/**
 * Apply a previously saved mapping (column mapping + value mapping, matched by header
 * name) to the current source table. Used to reuse a mapping across repeated exports of
 * the same tracker without persisting anything — the template is a local JSON file the
 * user saves and re-loads themselves.
 */
export function applyMappingTemplate(
  table: SourceTable,
  reference: { headers: string[]; columnMapping: ColumnMapping; values: ValueMappings; dateOrder: DateOrder },
): { columnMapping: ColumnMapping; values: ValueMappings; dateOrder: DateOrder } {
  const detected = detectColumns(table.headers);
  const byName = new Map(table.headers.map((h, i) => [h.trim().toLowerCase(), i]));
  const columnMapping = { ...detected };
  const used = new Set<number>();
  for (const field of Object.keys(columnMapping) as LogicalField[]) {
    const refCol = reference.columnMapping[field];
    const name = refCol === null || refCol === undefined ? undefined : reference.headers[refCol]?.trim().toLowerCase();
    const match = name !== undefined ? byName.get(name) : undefined;
    columnMapping[field] = match ?? null;
    if (match !== undefined) used.add(match);
  }
  for (const field of Object.keys(columnMapping) as LogicalField[]) {
    if (columnMapping[field] === null && reference.columnMapping[field] !== null && detected[field] !== null && !used.has(detected[field]!)) {
      columnMapping[field] = detected[field];
      used.add(detected[field]!);
    }
  }
  return { columnMapping, values: buildValueMappings(table, columnMapping, reference.values), dateOrder: reference.dateOrder };
}

/** True when at least one issue-identifying column is mapped. */
export function hasRecognizableFields(mapping: ColumnMapping): boolean {
  const keyFields: LogicalField[] = ['id', 'title', 'status', 'assignee', 'priority'];
  return keyFields.some((f) => mapping[f] !== null);
}

function projectNameOf(records: IssueRecord[], mapped: boolean): string | null {
  if (!mapped) return null;
  const names = new Set<string>();
  for (const r of records) {
    if (r.project) names.add(r.project);
    if (names.size > 1) return null;
  }
  return names.size === 1 ? [...names][0] : null;
}

/** Normalize every non-blank data row into an IssueRecord and compute data quality. */
export function buildDataset(file: ParsedFile, config: SetupConfig): Dataset {
  const table = sliceSource(file, config.headerRowIndex);
  const m = config.columnMapping;
  const { values } = config;
  const records: IssueRecord[] = [];
  const blankRows: number[] = [];
  const dateFields: DateField[] = ['created', 'updated', 'closed'];

  for (let i = 0; i < table.dataRows.length; i++) {
    const row = table.dataRows[i] ?? [];
    const sourceRow = table.firstDataRowNumber + i;
    if (isBlankRow(row)) {
      blankRows.push(sourceRow);
      continue;
    }

    const statusRaw = textAt(row, m.status);
    const statusRule = values.status[normKey(statusRaw)];
    const priorityRaw = textAt(row, m.priority);
    const priorityRule = values.priority[normKey(priorityRaw)];
    const assigneeRaw = textAt(row, m.assignee);
    const assignee = assigneeLabel(values.assignee[normKey(assigneeRaw)]);

    const dates: Record<DateField, Date | null> = { created: null, updated: null, closed: null };
    const invalidDates: DateField[] = [];
    for (const field of dateFields) {
      const col = m[field];
      if (col === null) continue;
      const parsed = parseDateCell(row[col] ?? null, config.dateOrder);
      dates[field] = parsed.date;
      if (parsed.invalid) invalidDates.push(field);
    }

    records.push({
      index: records.length,
      sourceRow,
      id: textAt(row, m.id),
      title: freeTextAt(row, m.title),
      statusRaw,
      status: statusRule ? cleanText(statusRule.label) || NO_STATUS_LABEL : NO_STATUS_LABEL,
      statusCategory: statusRule ? statusRule.category : 'unmapped',
      priorityRaw,
      priority: priorityRule ? (priorityRule.unknown ? UNKNOWN_PRIORITY_LABEL : cleanText(priorityRule.label) || NO_PRIORITY_LABEL) : NO_PRIORITY_LABEL,
      assigneeRaw,
      assignee: assignee.label,
      isUnassigned: assignee.unassigned,
      type: textAt(row, m.type),
      project: textAt(row, m.project),
      area: textAt(row, m.area),
      iteration: textAt(row, m.iteration),
      severity: textAt(row, m.severity),
      reporter: textAt(row, m.reporter),
      tags: textAt(row, m.tags),
      resolution: textAt(row, m.resolution),
      developer: textAt(row, m.developer),
      environment: textAt(row, m.environment),
      created: dates.created,
      updated: dates.updated,
      closed: dates.closed,
      invalidDates,
      isDuplicateId: false,
      isFirstOfId: true,
      cells: row,
    });
  }

  // Duplicate detection: records are kept as-is; only flagged.
  if (m.id !== null) {
    const counts = new Map<string, number>();
    for (const r of records) if (r.id) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    const seen = new Set<string>();
    for (const r of records) {
      if (!r.id || (counts.get(r.id) ?? 0) < 2) continue;
      r.isDuplicateId = true;
      r.isFirstOfId = !seen.has(r.id);
      seen.add(r.id);
    }
  }

  const quality = computeDataQuality({
    records,
    blankRows,
    totalDataRows: table.dataRows.length,
    headers: table.headers,
    duplicateHeaders: table.duplicateHeaders,
    config,
  });

  return {
    file,
    headers: table.headers,
    duplicateHeaders: table.duplicateHeaders,
    config,
    records,
    totalDataRows: table.dataRows.length,
    blankRows,
    quality,
    projectName: projectNameOf(records, m.project !== null),
  };
}
