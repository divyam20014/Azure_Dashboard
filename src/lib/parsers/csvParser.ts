import Papa from 'papaparse';
import type { CellValue, CsvDelimiter } from '@/types/issue';
import { ImportError } from './importErrors';
import { trimTrailingBlankRows } from './excelParser';

export const CSV_DELIMITERS: { value: CsvDelimiter; label: string }[] = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
];

/** Decode bytes as text. UTF-16 is detected from its byte-order mark; everything else is read as UTF-8 (BOM stripped). */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  const text = new TextDecoder('utf-8').decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export interface CsvParseResult {
  rows: CellValue[][];
  delimiter: CsvDelimiter;
  warnings: string[];
}

const MAX_REPORTED_ERRORS = 5;

/**
 * Parse delimited text. When no delimiter is given, Papa Parse detects it.
 * Quoted fields, escaped quotes, CRLF/LF/CR line endings and empty rows are supported.
 */
export function parseCsvText(
  text: string,
  fileName: string,
  delimiter?: CsvDelimiter,
  onProgress?: (fraction: number) => void,
): CsvParseResult {
  const rows: CellValue[][] = [];
  const errors: Papa.ParseError[] = [];
  let detected: string | undefined;
  // Normalise CRLF / CR / LF (including files that mix them) to LF before parsing.
  const normalized = text.replace(/\r\n?/g, '\n');
  const length = normalized.length || 1;

  Papa.parse<string[]>(normalized, {
    delimiter: delimiter ?? '',
    newline: '\n',
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    step: (result: Papa.ParseStepResult<string[]>) => {
      rows.push(result.data);
      for (const e of result.errors) errors.push({ ...e, row: rows.length - 1 });
      if (!detected) detected = result.meta.delimiter;
      if (onProgress && rows.length % 5000 === 0) onProgress(Math.min(1, (result.meta.cursor ?? 0) / length));
    },
  });
  onProgress?.(1);

  const warnings: string[] = [];
  const undetectable = errors.some((e) => e.code === 'UndetectableDelimiter');
  const quoteErrors = errors.filter((e) => e.type === 'Quotes');

  let used: CsvDelimiter = delimiter ?? ',';
  if (!delimiter) {
    used = (CSV_DELIMITERS.find((d) => d.value === detected)?.value ?? ',') as CsvDelimiter;
    if (undetectable) {
      warnings.push('The delimiter could not be detected automatically, so comma was used. Choose the correct delimiter if the columns look wrong.');
    }
  }

  const trimmed = trimTrailingBlankRows(rows);
  if (trimmed > 1) warnings.push(`${trimmed} empty lines at the end of the file were ignored.`);

  if (rows.length === 0) {
    if (quoteErrors.length > 0) {
      throw new ImportError('malformed_csv', `"${fileName}" could not be parsed: ${quoteErrors[0].message}.`);
    }
    throw new ImportError('no_rows', `"${fileName}" does not contain any rows.`);
  }

  if (quoteErrors.length > 0) {
    const lines = quoteErrors
      .slice(0, MAX_REPORTED_ERRORS)
      .map((e) => (typeof e.row === 'number' ? String(e.row + 1) : '?'))
      .join(', ');
    warnings.push(
      `${quoteErrors.length} malformed quoted field(s) were found (first at row(s) ${lines}). Affected rows may have merged or split columns — check the preview.`,
    );
  }

  return { rows, delimiter: used, warnings };
}
