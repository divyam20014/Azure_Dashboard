import type { CellValue } from '@/types/issue';

/** Trim and collapse internal whitespace (incl. non-breaking spaces). */
export function cleanText(value: string): string {
  return value.replace(/[\s ]+/g, ' ').trim();
}

/** Case- and whitespace-insensitive key used to group equivalent values. */
export function normKey(value: string): string {
  return cleanText(value).toLowerCase();
}

/** Lower-case alphanumeric-only form, e.g. "Re-Open" -> "reopen". */
export function compactKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(date: Date | null, withTime = false): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!withTime) return base;
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
  return hasTime ? `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}` : base;
}

/** Display string for any parsed cell. */
export function cellToString(value: CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatDate(value, true);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return value;
}

export function isBlankCell(value: CellValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** Percentage of total, or null when the total is zero. */
export function percentOf(count: number, total: number): number | null {
  if (!total) return null;
  return (count / total) * 100;
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function todayStamp(): string {
  return formatDate(new Date());
}

/** Filename-safe stem of the uploaded file name. */
export function fileStem(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '');
  return stem.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'dataset';
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
