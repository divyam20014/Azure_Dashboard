import { formatDate } from '@/lib/text';
import type { ReportCell, ReportTable } from './reportTables';

/** Characters that make spreadsheet applications treat a cell as a formula (or DDE payload). */
const FORMULA_TRIGGER = /^[=+\-@\t\r＝＋－＠]/;

/**
 * Neutralise spreadsheet formula injection: a text value that starts with a
 * formula trigger is prefixed with a single quote so it is shown as text.
 * Numbers are never altered.
 */
export function sanitizeForSpreadsheet(value: string): string {
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

/** Escape one CSV field per RFC 4180 (quotes doubled; quoted when it contains a delimiter, quote or line break). */
export function escapeCsvField(value: ReportCell | boolean | undefined): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (value instanceof Date) text = formatDate(value, true);
  else if (typeof value === 'number') text = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'boolean') text = value ? 'TRUE' : 'FALSE';
  else text = sanitizeForSpreadsheet(value);
  if (/[",\r\n]/.test(text) || /^\s|\s$/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function rowsToCsv(rows: (ReportCell | boolean | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
}

/** CSV for a report table. Percent columns are written as percentages with one decimal. */
export function tableToCsv(table: ReportTable): string {
  const header = table.columns.map((c) => c.header);
  const body = table.rows.map((row) =>
    row.map((cell, i) => {
      if (table.columns[i]?.kind === 'pct' && typeof cell === 'number') return Number((cell * 100).toFixed(1));
      if (table.columns[i]?.kind === 'date' && cell instanceof Date) return formatDate(cell, true);
      return cell;
    }),
  );
  return rowsToCsv([header, ...body]);
}

/** UTF-8 BOM so Excel opens non-ASCII names correctly. */
export const CSV_BOM = '﻿';

export function csvBlob(csv: string): Blob {
  return new Blob([CSV_BOM, csv], { type: 'text/csv;charset=utf-8' });
}
