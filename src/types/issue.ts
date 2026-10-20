/** A single spreadsheet cell after parsing. Dates come from Excel date cells. */
export type CellValue = string | number | boolean | Date | null;

export type FileKind = 'xlsx' | 'xls' | 'csv';

export type CsvDelimiter = ',' | ';' | '\t' | '|';

/** A file that has been read and parsed in the browser (never uploaded anywhere). */
export interface ParsedFile {
  fileName: string;
  fileSize: number;
  kind: FileKind;
  /** Worksheet names (Excel) or a single pseudo-sheet name (CSV). */
  sheetNames: string[];
  /** The currently loaded worksheet / CSV content as an array of rows. */
  sheetName: string;
  rows: CellValue[][];
  /** 1-based source row number of rows[0] (worksheets may start below row 1). */
  firstRowNumber: number;
  /** CSV only: the delimiter that was used. */
  delimiter?: CsvDelimiter;
  /** Non-fatal parsing notices (e.g. malformed CSV quotes on specific lines). */
  warnings: string[];
}

export type WorkflowCategory = 'closed' | 'open' | 'unmapped';

/** One imported, normalized issue. Original cells are kept by reference for the details view. */
export interface IssueRecord {
  /** Position in the dataset's records array. */
  index: number;
  /** 1-based row number in the source worksheet / CSV (as a spreadsheet user would see it). */
  sourceRow: number;
  id: string;
  title: string;
  statusRaw: string;
  status: string;
  statusCategory: WorkflowCategory;
  priorityRaw: string;
  priority: string;
  assigneeRaw: string;
  assignee: string;
  isUnassigned: boolean;
  type: string;
  project: string;
  area: string;
  iteration: string;
  severity: string;
  reporter: string;
  tags: string;
  resolution: string;
  developer: string;
  environment: string;
  created: Date | null;
  updated: Date | null;
  closed: Date | null;
  /** Names of mapped date fields whose non-blank value could not be parsed. */
  invalidDates: DateField[];
  /** True when the issue ID is non-blank and appears on more than one record. */
  isDuplicateId: boolean;
  /** True for the first record carrying a given ID (or for every record without duplicates). */
  isFirstOfId: boolean;
  cells: CellValue[];
}

export type DateField = 'created' | 'updated' | 'closed';

export const UNASSIGNED_LABEL = 'Unassigned';
export const NO_STATUS_LABEL = '(No Status)';
export const NO_PRIORITY_LABEL = '(No Priority)';
/** A source value the user (or the defaults) declared to mean 'priority unknown' — distinct from a blank cell. */
export const UNKNOWN_PRIORITY_LABEL = 'Unknown';
export const BLANK_LABEL = '(Blank)';
