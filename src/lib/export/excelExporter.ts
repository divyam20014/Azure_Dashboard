import * as XLSX from 'xlsx';
import type { ReportTable } from './reportTables';

const MAX_COL_WIDTH = 60;
const MIN_COL_WIDTH = 8;

/** Excel sheet names: max 31 chars, no []:*?/\ and unique within the workbook. */
export function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function tableToSheet(table: ReportTable): XLSX.WorkSheet {
  const aoa = [table.columns.map((c) => c.header), ...table.rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

  // Text values are written as string cells, which Excel never evaluates as formulas.
  table.columns.forEach((col, c) => {
    if (col.kind !== 'pct' && col.kind !== 'date') return;
    for (let r = 1; r <= table.rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      if (col.kind === 'pct' && cell.t === 'n') cell.z = '0.0%';
      if (col.kind === 'date' && (cell.t === 'd' || cell.t === 'n')) cell.z = 'yyyy-mm-dd hh:mm';
    }
  });

  ws['!cols'] = table.columns.map((col, c) => {
    let width = col.header.length;
    const sample = Math.min(table.rows.length, 500);
    for (let r = 0; r < sample; r++) {
      const v = table.rows[r][c];
      const len = v === null || v === undefined ? 0 : v instanceof Date ? 16 : String(v).length;
      if (len > width) width = len;
    }
    return { wch: Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, width + 2)) };
  });
  if (table.rows.length > 0) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: table.rows.length, c: table.columns.length - 1 } }) };
  return ws;
}

/** Build an .xlsx workbook entirely in memory. */
export function buildWorkbook(tables: ReportTable[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const table of tables) XLSX.utils.book_append_sheet(wb, tableToSheet(table), safeSheetName(table.name, used));
  return wb;
}

export function workbookBlob(tables: ReportTable[]): Blob {
  const data = XLSX.write(buildWorkbook(tables), { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer;
  return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
