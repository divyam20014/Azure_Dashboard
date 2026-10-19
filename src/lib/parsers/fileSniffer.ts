import type { FileKind } from '@/types/issue';
import { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '@/lib/config';
import { ImportError } from './importErrors';

export type ContentSignature = 'zip' | 'cfb' | 'text' | 'binary';

export function extensionOf(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  return match ? match[0] : '';
}

/** Checks done before reading the file at all: extension and size. */
export function validateFileMeta(fileName: string, size: number): FileKind {
  const ext = extensionOf(fileName);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ImportError(
      'unsupported_type',
      `"${fileName}" is not supported. Upload an Excel workbook (.xlsx, .xls) or a CSV file (.csv).`,
    );
  }
  if (size === 0) {
    throw new ImportError('empty_file', `"${fileName}" contains no data (0 bytes).`);
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new ImportError(
      'too_large',
      `"${fileName}" is ${(size / 1024 / 1024).toFixed(1)} MB. The maximum supported size is ${MAX_FILE_SIZE_MB} MB. Filter the export to fewer rows or columns and try again.`,
    );
  }
  return ext.slice(1) as FileKind;
}

/** Identify the real container format from the first bytes instead of trusting the extension. */
export function sniffSignature(bytes: Uint8Array): ContentSignature {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'zip';
  }
  const cfb = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (bytes.length >= 8 && cfb.every((b, i) => bytes[i] === b)) return 'cfb';
  // UTF-16 text legitimately contains NUL bytes; recognise it by its byte-order mark.
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    return 'text';
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return 'binary';
  }
  return 'text';
}

/**
 * Reconcile the extension with the actual content.
 * Returns how the content should be parsed: as a workbook or as delimited text.
 */
export function resolveParseMode(fileName: string, declared: FileKind, signature: ContentSignature): 'workbook' | 'csv' {
  if (declared === 'csv') {
    if (signature === 'zip' || signature === 'cfb') {
      throw new ImportError(
        'content_mismatch',
        `"${fileName}" has a .csv extension but contains an Excel workbook. Rename it to .xlsx/.xls or export it again as CSV.`,
      );
    }
    if (signature === 'binary') {
      throw new ImportError('content_mismatch', `"${fileName}" has a .csv extension but contains binary data, not text.`);
    }
    return 'csv';
  }
  if (declared === 'xlsx' && signature !== 'zip' && signature !== 'cfb') {
    throw new ImportError(
      'content_mismatch',
      `"${fileName}" has an .xlsx extension but is not a valid Excel workbook. The file may be corrupted or saved in a different format.`,
    );
  }
  if (signature === 'binary') {
    throw new ImportError('corrupt_workbook', `"${fileName}" is not a recognizable Excel workbook. The file may be corrupted.`);
  }
  // .xls may legitimately be legacy binary, a zip, or an HTML/XML spreadsheet; the workbook reader handles all.
  return 'workbook';
}
