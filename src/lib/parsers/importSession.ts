import type { CsvDelimiter, ParsedFile } from '@/types/issue';
import { validateFileMeta, sniffSignature, resolveParseMode } from './fileSniffer';
import { readWorkbook, sheetToRows, firstNonEmptySheet, type Workbook } from './excelParser';
import { decodeText, parseCsvText } from './csvParser';
import { ImportError } from './importErrors';

export type ParseStage = 'reading' | 'parsing' | 'preparing';

export interface ParseProgress {
  stage: ParseStage;
  /** 0..1 when measurable. */
  fraction?: number;
}

export interface ParseOptions {
  sheetName?: string;
  delimiter?: CsvDelimiter;
}

export type ProgressCallback = (progress: ParseProgress) => void;

function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsArrayBuffer(blob);
  });
}

function identity(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

/**
 * Parses one file entirely in memory. Runs inside the parsing Web Worker (or on the
 * main thread when workers are unavailable, e.g. in tests). The last workbook is cached
 * so that switching worksheets does not re-read the file; `dispose()` releases it.
 */
export class ImportSession {
  private cacheKey: string | null = null;
  private workbook: Workbook | null = null;
  private csvText: string | null = null;

  async parse(file: File, options: ParseOptions = {}, onProgress?: ProgressCallback): Promise<ParsedFile> {
    const kind = validateFileMeta(file.name, file.size);
    const key = identity(file);

    if (this.cacheKey !== key) {
      this.dispose();
      onProgress?.({ stage: 'reading' });
      const buffer = await readBlob(file);
      const bytes = new Uint8Array(buffer);
      if (bytes.length === 0) throw new ImportError('empty_file', `"${file.name}" contains no data (0 bytes).`);
      const mode = resolveParseMode(file.name, kind, sniffSignature(bytes));
      onProgress?.({ stage: 'parsing' });
      if (mode === 'workbook') {
        this.workbook = readWorkbook(buffer, file.name);
      } else {
        this.csvText = decodeText(bytes);
        if (this.csvText.trim() === '') throw new ImportError('empty_file', `"${file.name}" contains only whitespace.`);
      }
      this.cacheKey = key;
    }

    if (this.workbook) {
      const wb = this.workbook;
      const sheetName = options.sheetName && wb.SheetNames.includes(options.sheetName) ? options.sheetName : firstNonEmptySheet(wb);
      onProgress?.({ stage: 'preparing' });
      const { rows, trimmed, firstRowNumber } = sheetToRows(wb, sheetName);
      const warnings: string[] = [];
      if (trimmed > 0) warnings.push(`${trimmed} empty row(s) at the end of the worksheet were ignored.`);
      return {
        fileName: file.name,
        fileSize: file.size,
        kind: kind === 'csv' ? 'xlsx' : kind,
        sheetNames: [...wb.SheetNames],
        sheetName,
        rows,
        firstRowNumber,
        warnings,
      };
    }

    const text = this.csvText ?? '';
    onProgress?.({ stage: 'parsing', fraction: 0 });
    const result = parseCsvText(text, file.name, options.delimiter, (fraction) => onProgress?.({ stage: 'parsing', fraction }));
    return {
      fileName: file.name,
      fileSize: file.size,
      kind: 'csv',
      sheetNames: ['CSV data'],
      sheetName: 'CSV data',
      rows: result.rows,
      firstRowNumber: 1,
      delimiter: result.delimiter,
      warnings: result.warnings,
    };
  }

  dispose(): void {
    this.cacheKey = null;
    this.workbook = null;
    this.csvText = null;
  }
}
