import * as XLSX from 'xlsx';
import type { CellValue } from '@/types/issue';
import { isBlankCell } from '@/lib/text';
import { ImportError } from './importErrors';

export type Workbook = XLSX.WorkBook;

export function readWorkbook(buffer: ArrayBuffer, fileName: string): Workbook {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(new Uint8Array(buffer), {
      type: 'array',
      cellDates: true,
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      cellText: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Encrypted Office files arrive as a CFB container; "ZIP encryption" errors come from truncated/corrupt zips.
    if (/password|ECMA-376|EncryptedPackage|EncryptionInfo/i.test(message) || (/encrypt/i.test(message) && !/zip/i.test(message))) {
      throw new ImportError(
        'password_protected',
        `"${fileName}" is password-protected. Remove the password in Excel (File > Info > Protect Workbook), save, and upload it again.`,
      );
    }
    if (err instanceof RangeError) throw err;
    throw new ImportError('corrupt_workbook', `"${fileName}" could not be read as an Excel workbook. It may be corrupted or truncated. (${message})`);
  }
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new ImportError('no_rows', `"${fileName}" does not contain any worksheets.`);
  }
  return wb;
}

function normalizeCell(value: unknown): CellValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

/** Remove trailing rows that are entirely blank (e.g. formatted but empty rows). Returns the count removed. */
export function trimTrailingBlankRows(rows: CellValue[][]): number {
  let removed = 0;
  while (rows.length > 0 && rows[rows.length - 1].every((c) => isBlankCell(c))) {
    rows.pop();
    removed++;
  }
  return removed;
}

export function sheetToRows(wb: Workbook, sheetName: string): { rows: CellValue[][]; trimmed: number; firstRowNumber: number } {
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new ImportError('empty_sheet', `Worksheet "${sheetName}" was not found in the workbook.`);
  const ref = ws['!ref'];
  const firstRowNumber = ref ? XLSX.utils.decode_range(ref).s.r + 1 : 1;
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const rows: CellValue[][] = new Array(raw.length);
  for (let r = 0; r < raw.length; r++) {
    const src = raw[r] ?? [];
    const row: CellValue[] = new Array(src.length);
    for (let c = 0; c < src.length; c++) row[c] = normalizeCell(src[c]);
    rows[r] = row;
  }
  const trimmed = trimTrailingBlankRows(rows);
  return { rows, trimmed, firstRowNumber };
}

/** Pick the first worksheet that contains any data, falling back to the first sheet. */
export function firstNonEmptySheet(wb: Workbook): string {
  for (const name of wb.SheetNames) {
    const ref = wb.Sheets[name]?.['!ref'];
    if (ref && ref !== 'A1') return name;
    if (ref === 'A1') {
      const { rows } = sheetToRows(wb, name);
      if (rows.length > 0) return name;
    }
  }
  return wb.SheetNames[0];
}
