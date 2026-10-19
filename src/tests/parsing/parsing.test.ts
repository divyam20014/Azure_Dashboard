import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCsvText, decodeText } from '@/lib/parsers/csvParser';
import { sniffSignature, validateFileMeta, resolveParseMode } from '@/lib/parsers/fileSniffer';
import { ImportSession } from '@/lib/parsers/importSession';
import { ImportError } from '@/lib/parsers/importErrors';
import { sampleCsv } from '../fixtures';

function fileFrom(content: BlobPart, name: string, type = ''): File {
  return new File([content], name, { type, lastModified: 1 });
}

function xlsxFile(sheets: Record<string, unknown[][]>, name = 'issues.xlsx'): File {
  const wb = XLSX.utils.book_new();
  for (const [sheet, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet);
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return fileFrom(new Uint8Array(data), name);
}

async function expectImportError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ImportError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('CSV parsing', () => {
  it('handles quoted commas, escaped quotes, line breaks in quotes and mixed line endings', () => {
    const text = 'ID,Title\r\n1,"Hello, world"\n2,"She said ""hi"""\r3,"multi\nline"\r\n';
    const { rows, delimiter } = parseCsvText(text, 'x.csv');
    expect(delimiter).toBe(',');
    expect(rows).toEqual([
      ['ID', 'Title'],
      ['1', 'Hello, world'],
      ['2', 'She said "hi"'],
      ['3', 'multi\nline'],
    ]);
  });

  it('keeps interior empty rows (so they can be reported) and drops the trailing newline', () => {
    const { rows } = parseCsvText('A,B\n1,2\n\n3,4\n', 'x.csv');
    expect(rows).toHaveLength(4);
    expect(rows[2]).toEqual(['']);
  });

  it('detects semicolon and tab delimiters, and honors an explicit choice', () => {
    expect(parseCsvText('A;B;C\n1;2;3\n', 'x.csv').delimiter).toBe(';');
    expect(parseCsvText('A\tB\tC\n1\t2\t3\n', 'x.csv').delimiter).toBe('\t');
    const forced = parseCsvText('A;B\n1;2\n', 'x.csv', ',');
    expect(forced.rows[0]).toEqual(['A;B']);
  });

  it('strips the UTF-8 BOM and decodes UTF-16', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('ID,Name\n1,Zoë\n')]);
    expect(decodeText(bom).startsWith('ID')).toBe(true);
    const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x2c, 0x00, 0x42, 0x00]);
    expect(decodeText(utf16)).toBe('A,B');
  });

  it('warns (but continues) on malformed quotes', () => {
    const result = parseCsvText('ID,Title\n1,"broken\n2,ok\n', 'x.csv');
    expect(result.warnings.join(' ')).toMatch(/malformed/i);
  });
});

describe('file validation', () => {
  it('rejects unsupported extensions, empty files and oversized files', () => {
    expect(() => validateFileMeta('report.pdf', 10)).toThrow(/not supported/);
    expect(() => validateFileMeta('report.csv', 0)).toThrow(/0 bytes/);
    expect(() => validateFileMeta('report.csv', 10 ** 12)).toThrow(/maximum supported size/);
    expect(validateFileMeta('Report.XLSX', 10)).toBe('xlsx');
  });

  it('checks real content instead of trusting the extension', () => {
    expect(sniffSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe('zip');
    expect(() => resolveParseMode('a.csv', 'csv', 'zip')).toThrow(/contains an Excel workbook/);
    expect(() => resolveParseMode('a.xlsx', 'xlsx', 'text')).toThrow(/not a valid Excel workbook/);
    expect(() => resolveParseMode('a.csv', 'csv', 'binary')).toThrow(/binary/);
    expect(resolveParseMode('a.xls', 'xls', 'text')).toBe('workbook');
  });
});

describe('ImportSession', () => {
  it('parses a CSV file end to end', async () => {
    const parsed = await new ImportSession().parse(fileFrom(sampleCsv(), 'sample.csv'));
    expect(parsed.kind).toBe('csv');
    expect(parsed.rows[0][0]).toBe('ID');
    expect(parsed.rows).toHaveLength(11);
  });

  it('lists worksheets and loads the selected one', async () => {
    const file = xlsxFile({ Summary: [], Bugs: [['ID', 'State'], [1, 'New']], Tasks: [['ID', 'Status'], [9, 'Closed'], [10, 'New']] });
    const session = new ImportSession();
    const first = await session.parse(file);
    expect(first.sheetNames).toEqual(['Summary', 'Bugs', 'Tasks']);
    expect(first.sheetName).toBe('Bugs'); // first non-empty sheet
    const tasks = await session.parse(file, { sheetName: 'Tasks' });
    expect(tasks.rows).toEqual([['ID', 'Status'], [9, 'Closed'], [10, 'New']]);
  });

  it('reports an empty worksheet as zero rows rather than failing', async () => {
    const file = xlsxFile({ Empty: [], Data: [['ID'], [1]] });
    const parsed = await new ImportSession().parse(file, { sheetName: 'Empty' });
    expect(parsed.rows).toEqual([]);
  });

  it('rejects corrupt workbooks and mismatched content with clear errors', async () => {
    const corrupt = fileFrom(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8]), 'broken.xlsx');
    await expectImportError(new ImportSession().parse(corrupt), 'corrupt_workbook');
    await expectImportError(new ImportSession().parse(fileFrom('ID,Title\n1,x', 'fake.xlsx')), 'content_mismatch');
    await expectImportError(new ImportSession().parse(fileFrom('   \n  ', 'blank.csv')), 'empty_file');
    await expectImportError(new ImportSession().parse(fileFrom('x', 'notes.txt')), 'unsupported_type');
  });

  it('parses Excel date cells as dates', async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['ID', 'Created Date'], [1, new Date(2024, 0, 15)]], { cellDates: true });
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true }) as ArrayBuffer;
    const parsed = await new ImportSession().parse(fileFrom(new Uint8Array(data), 'dates.xlsx'));
    const cell = parsed.rows[1][1];
    expect(cell).toBeInstanceOf(Date);
    expect((cell as Date).getFullYear()).toBe(2024);
  });
});
