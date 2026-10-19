import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { escapeCsvField, rowsToCsv, sanitizeForSpreadsheet, tableToCsv } from '@/lib/export/csvExporter';
import { buildWorkbook, safeSheetName } from '@/lib/export/excelExporter';
import { issueRegisterTable, statusSummaryTable, assigneePriorityTable } from '@/lib/export/reportTables';
import { buildDataset, initialSetup } from '@/lib/normalization/datasetBuilder';
import { computeAggregates } from '@/lib/analytics/aggregate';
import { sampleParsedFile } from '../fixtures';

describe('CSV escaping', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(42)).toBe('42');
    expect(rowsToCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });
});

describe('formula-injection protection', () => {
  it.each(['=SUM(A1:A2)', '+1+1', '-2+3', '@cmd', '\tTAB', '=HYPERLINK("http://x","y")'])('neutralises %j', (value) => {
    expect(sanitizeForSpreadsheet(value).startsWith("'")).toBe(true);
    const field = escapeCsvField(value);
    expect(field.replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('leaves ordinary text and numbers unchanged', () => {
    expect(sanitizeForSpreadsheet('Login fails')).toBe('Login fails');
    expect(escapeCsvField(-5)).toBe('-5');
  });
});

describe('report tables and workbook', () => {
  const file = sampleParsedFile();
  const ds = buildDataset(file, initialSetup(file));
  const agg = computeAggregates(ds.records, ds.config.values);

  it('exports the issue register with original values and all source columns', () => {
    const table = issueRegisterTable(ds.records, ds);
    expect(table.rows).toHaveLength(9);
    const headers = table.columns.map((c) => c.header);
    expect(headers.slice(0, 3)).toEqual(['Source Row', 'Issue ID', 'Title']);
    expect(headers).toContain('Original Status');
    expect(headers).toContain('Source: Assigned To');
    const csv = tableToCsv(table);
    expect(csv.split('\r\n')).toHaveLength(10);
  });

  it('writes status percentages that match the dashboard', () => {
    const csv = tableToCsv(statusSummaryTable(agg));
    expect(csv).toContain('Closed,Closed,2,22.2');
  });

  it('builds an .xlsx workbook whose counts round-trip', () => {
    const wb = buildWorkbook([statusSummaryTable(agg), assigneePriorityTable(agg)]);
    const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const back = XLSX.read(bytes, { type: 'array', cellNF: true });
    expect(back.SheetNames).toEqual(['Status Summary', 'Assignee-Priority Matrix']);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(back.Sheets['Assignee-Priority Matrix'], { header: 1 });
    const total = rows[rows.length - 1];
    expect(total[0]).toBe('Total');
    expect(total[total.length - 1]).toBe(9);
    const statusCell = back.Sheets['Status Summary']['D2'];
    expect(statusCell.z).toBe('0.0%');
  });

  it('produces valid unique sheet names', () => {
    const used = new Set<string>();
    expect(safeSheetName('A/B:C*?[x]', used)).toBe('A B C   x');
    expect(safeSheetName('A very long worksheet name exceeding the limit', used)).toHaveLength(31);
    expect(safeSheetName('A very long worksheet name exceeding the limit', used)).toMatch(/\(2\)$/);
  });

  it('exports an empty filtered result as headers only', () => {
    const csv = tableToCsv(issueRegisterTable([], ds));
    expect(csv.split('\r\n')).toHaveLength(1);
  });
});
