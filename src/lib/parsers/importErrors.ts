export type ImportErrorCode =
  | 'unsupported_type'
  | 'empty_file'
  | 'too_large'
  | 'content_mismatch'
  | 'corrupt_workbook'
  | 'password_protected'
  | 'malformed_csv'
  | 'no_rows'
  | 'empty_sheet'
  | 'out_of_memory'
  | 'cancelled'
  | 'processing_failed';

const TITLES: Record<ImportErrorCode, string> = {
  unsupported_type: 'Unsupported file type',
  empty_file: 'The file is empty',
  too_large: 'File is too large',
  content_mismatch: 'File content does not match its extension',
  corrupt_workbook: 'The workbook could not be read',
  password_protected: 'Password-protected workbook',
  malformed_csv: 'Malformed CSV file',
  no_rows: 'No usable rows found',
  empty_sheet: 'The selected worksheet is empty',
  out_of_memory: 'Not enough memory to process this file',
  cancelled: 'Import cancelled',
  processing_failed: 'The file could not be processed',
};

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly title: string;

  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.title = TITLES[code];
  }
}

export interface ImportErrorPayload {
  code: ImportErrorCode;
  message: string;
}

export function toImportError(err: unknown): ImportError {
  if (err instanceof ImportError) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof RangeError || /out of memory|allocation failed|array buffer allocation|invalid array length|invalid string length/i.test(message)) {
    return new ImportError(
      'out_of_memory',
      'The browser could not allocate enough memory for this file. Close other tabs, try a smaller export (fewer columns or rows), or save the sheet as CSV and try again.',
    );
  }
  return new ImportError('processing_failed', `Unexpected error while processing the file: ${message}`);
}

export function fromPayload(payload: ImportErrorPayload): ImportError {
  return new ImportError(payload.code, payload.message);
}
