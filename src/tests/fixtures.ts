import type { CellValue, ParsedFile } from '@/types/issue';

/** A small, hand-checked dataset. Expected totals are documented next to each row. */
export const SAMPLE_HEADERS = ['ID', 'Title', 'State', 'Assigned To', 'Priority', 'Work Item Type', 'Created Date', 'Severity'];

export const SAMPLE_ROWS: CellValue[][] = [
  ['101', 'Login fails', 'Closed', 'Asha Rao', 'P1', 'Bug', '2024-01-05', '1 - Critical'],
  ['102', 'Button misaligned', 'New', 'Asha Rao', 'P3', 'Bug', '2024-01-06', '3 - Medium'],
  ['103', 'Crash on save', ' re-open ', 'Ben Ito', 'P1', 'Bug', '2024-01-07', '1 - Critical'],
  ['104', 'Slow report', 'Ready for QA', 'ben ito', 'P2', 'Bug', '2024-01-08', '2 - High'],
  ['105', 'Typo', 'Development in Progress', 'Carla Diaz', 'P4', 'Task', 'not a date', '4 - Low'],
  ['106', 'Export broken', 'closed', '', 'P2', 'Bug', '2024-01-10', '2 - High'],
  ['107', 'Timeout', 'Blocked', 'Carla Diaz', '', 'Bug', '', ''],
  [null, null, null, null, null, null, null, null], // blank row
  ['104', 'Slow report (dup)', 'New', 'Ben Ito', 'P2', 'Bug', '2024-01-11', '2 - High'], // duplicate ID 104
  ['', 'No id here', 'NEW', 'Asha Rao', 'Urgent-ish', 'Bug', '2024-01-12', ''],
];

/*
 * Expected (all imported records, 9 non-blank):
 *   Closed 2 (101, 106) · New 3 (102, 104dup, no-id) · Reopened 1 · Ready for QA 1 · Dev in Progress 1 · Blocked 1
 *   Assignees: Asha Rao 3, Ben Ito 3 (case-insensitive merge), Carla Diaz 2, Unassigned 1
 *   Priorities: P1 2, P2 3, P3 1, P4 1, (No Priority) 1, "Urgent-ish" 1 (unmapped)
 *   Duplicate ID records 2 (104 x2); missing ID 1; missing assignee 1; missing priority 1; invalid date 1; blank row 1
 */

export function sampleCsv(): string {
  const esc = (v: CellValue) => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [SAMPLE_HEADERS, ...SAMPLE_ROWS].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

export function sampleParsedFile(overrides: Partial<ParsedFile> = {}): ParsedFile {
  return {
    fileName: 'sample.csv',
    fileSize: 1000,
    kind: 'csv',
    sheetNames: ['CSV data'],
    sheetName: 'CSV data',
    rows: [SAMPLE_HEADERS, ...SAMPLE_ROWS.map((r) => [...r])],
    firstRowNumber: 1,
    delimiter: ',',
    warnings: [],
    ...overrides,
  };
}
