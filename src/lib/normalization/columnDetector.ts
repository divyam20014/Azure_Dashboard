import type { CellValue } from '@/types/issue';
import { LOGICAL_FIELDS, type ColumnMapping, type LogicalField } from '@/types/mappings';
import { cellToString, cleanText, compactKey, isBlankCell } from '@/lib/text';
import { HEADER_SCAN_ROWS } from '@/lib/config';

/** Known header names per logical field (matched case/punctuation-insensitively). */
export const FIELD_SYNONYMS: Record<LogicalField, string[]> = {
  id: ['ID', 'Issue ID', 'Bug ID', 'Work Item ID', 'Ticket ID', 'Defect ID', 'Issue Key', 'Key', 'Item ID', 'Ticket', 'Issue No', 'Bug No'],
  title: ['Title', 'Summary', 'Issue Title', 'Subject', 'Bug Title', 'Issue Summary', 'Short Description', 'Defect Title'],
  status: ['State', 'Status', 'Workflow Status', 'Issue Status', 'Bug Status', 'Current State', 'Workflow State'],
  assignee: ['Assigned To', 'Assignee', 'Owner', 'Assigned User', 'Assigned', 'Assigned Person', 'Responsible'],
  priority: ['Priority', 'Bug Priority', 'Issue Priority', 'Pri'],
  severity: ['Severity', 'Impact', 'Risk', 'Bug Severity'],
  type: ['Work Item Type', 'Issue Type', 'Type', 'Item Type', 'Bug Type', 'Ticket Type'],
  created: ['Created Date', 'Created On', 'Reported Date', 'Created', 'Date Created', 'Creation Date', 'Reported On', 'Opened Date', 'Created At'],
  updated: ['Changed Date', 'Updated Date', 'Modified Date', 'Updated', 'Last Updated', 'Last Modified', 'Modified', 'Changed', 'Updated At', 'Last Changed Date'],
  closed: ['Closed Date', 'Resolved Date', 'Closed On', 'Resolved On', 'Date Closed', 'Closed At', 'Resolved At'],
  reporter: ['Created By', 'Reporter', 'Reported By', 'Raised By', 'Opened By'],
  project: ['Project', 'Project Name', 'Team Project'],
  area: ['Area Path', 'Module', 'Component', 'Area', 'Feature Area', 'Components'],
  iteration: ['Iteration Path', 'Sprint', 'Iteration', 'Release', 'Milestone'],
  tags: ['Tags', 'Labels', 'Tag', 'Label'],
  resolution: ['Resolution', 'Resolution Type', 'Resolved Reason'],
  developer: ['Developer', 'Assigned Developer', 'Dev Owner'],
  environment: ['Environment', 'Test Environment', 'Env', 'Found In Environment'],
};

const DATE_FIELDS: LogicalField[] = ['created', 'updated', 'closed'];
const COMPACT_SYNONYMS = Object.fromEntries(
  LOGICAL_FIELDS.map((f) => [f, FIELD_SYNONYMS[f].map(compactKey)]),
) as Record<LogicalField, string[]>;

/** Header comparison key. Azure DevOps reference names such as "System.AssignedTo" use their last segment. */
export function headerKey(header: string): string {
  const trimmed = header.trim();
  const lastSegment = /^[A-Za-z]+(\.[A-Za-z]+)+$/.test(trimmed) ? trimmed.slice(trimmed.lastIndexOf('.') + 1) : trimmed;
  return compactKey(lastSegment);
}

function isDateLikeHeader(key: string): boolean {
  return /date|time|on$|at$/.test(key);
}

export function emptyMapping(): ColumnMapping {
  return Object.fromEntries(LOGICAL_FIELDS.map((f) => [f, null])) as ColumnMapping;
}

/**
 * Detect probable source columns for each logical field.
 * Pass 1 accepts exact synonym matches; pass 2 accepts headers that contain a
 * distinctive synonym (5+ characters). Each column is used at most once.
 */
export function detectColumns(headers: string[]): ColumnMapping {
  const mapping = emptyMapping();
  const used = new Set<number>();
  const keys = headers.map(headerKey);

  for (const field of LOGICAL_FIELDS) {
    for (const syn of COMPACT_SYNONYMS[field]) {
      const col = keys.findIndex((k, i) => !used.has(i) && k === syn);
      if (col >= 0) {
        mapping[field] = col;
        used.add(col);
        break;
      }
    }
  }

  for (const field of LOGICAL_FIELDS) {
    if (mapping[field] !== null) continue;
    const isDate = DATE_FIELDS.includes(field);
    const col = keys.findIndex((k, i) => {
      if (used.has(i) || !k) return false;
      if (isDate !== isDateLikeHeader(k)) return false;
      return COMPACT_SYNONYMS[field].some((syn) => syn.length >= 5 && k.includes(syn));
    });
    if (col >= 0) {
      mapping[field] = col;
      used.add(col);
    }
  }
  return mapping;
}

/** Number of logical fields a candidate header row would map. */
function headerScore(row: CellValue[]): number {
  const headers = row.map((c) => cellToString(c));
  const mapping = detectColumns(headers);
  const mapped = LOGICAL_FIELDS.filter((f) => mapping[f] !== null).length;
  const textCells = row.filter((c) => typeof c === 'string' && c.trim() !== '').length;
  return mapped * 10 + textCells;
}

/**
 * Guess which row holds the headers: the row within the first rows that maps the
 * most known fields. Falls back to the first non-blank row.
 */
export function detectHeaderRow(rows: CellValue[][]): number {
  let best = -1;
  let bestScore = -1;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row || row.every((c) => isBlankCell(c))) continue;
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best < 0 ? 0 : best;
}

/**
 * Build unique display headers from the chosen header row.
 * Blank headers become "Column N"; repeated headers get a numeric suffix and are reported.
 */
export function buildHeaders(row: CellValue[] | undefined, width: number): { headers: string[]; duplicates: string[] } {
  const headers: string[] = [];
  const seen = new Map<string, { first: string; count: number }>();
  const duplicates = new Set<string>();
  for (let c = 0; c < width; c++) {
    let name = cleanText(cellToString(row?.[c] ?? null));
    if (!name) name = `Column ${c + 1}`;
    const key = name.toLowerCase();
    const entry = seen.get(key);
    if (entry) {
      entry.count++;
      duplicates.add(entry.first);
      headers.push(`${name} (${entry.count})`);
    } else {
      seen.set(key, { first: name, count: 1 });
      headers.push(name);
    }
  }
  return { headers, duplicates: [...duplicates] };
}

/** Widest row length from the header row downwards. */
export function tableWidth(rows: CellValue[][], headerRowIndex: number): number {
  let width = 0;
  for (let r = headerRowIndex; r < rows.length; r++) width = Math.max(width, rows[r]?.length ?? 0);
  return width;
}
