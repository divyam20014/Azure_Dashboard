import type { CellValue } from '@/types/issue';
import type { DateOrder } from '@/types/mappings';

export interface DateParseResult {
  date: Date | null;
  /** True when the cell had content that could not be read as a date. */
  invalid: boolean;
}

const BLANK: DateParseResult = { date: null, invalid: false };
const INVALID: DateParseResult = { date: null, invalid: true };
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

function validDate(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): Date | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const date = new Date(y, m - 1, d, hh, mm, ss);
  // Reject roll-overs such as 31 February.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Excel serial day number (1900 date system) -> local Date. */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const utc = new Date(EXCEL_EPOCH_UTC + Math.round(serial * 86400000));
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds());
}

function expandYear(y: number, digits: number): number {
  if (digits > 2) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

function to24h(hours: number, meridiem: string | undefined): number {
  if (!meridiem) return hours;
  const pm = meridiem.toLowerCase() === 'pm';
  if (hours === 12) return pm ? 12 : 0;
  return pm ? hours + 12 : hours;
}

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i;
const YMD_SLASH_RE = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const NUMERIC_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i;

/**
 * Parse a date cell. Supports Excel dates, Excel serial numbers, ISO-8601,
 * yyyy/mm/dd, numeric day-month-year in the configured order (MDY or DMY), and
 * month-name formats such as "12 Jan 2024" or "Jan 12, 2024".
 * Ambiguous numeric dates are read strictly in the configured order.
 */
export function parseDateCell(value: CellValue, order: DateOrder): DateParseResult {
  if (value === null || value === undefined) return BLANK;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? INVALID : { date: value, invalid: false };
  if (typeof value === 'number') {
    const d = excelSerialToDate(value);
    return d ? { date: d, invalid: false } : INVALID;
  }
  if (typeof value === 'boolean') return INVALID;
  const text = value.trim();
  if (!text) return BLANK;

  let m = ISO_RE.exec(text);
  if (m) {
    if (m[7]) {
      const d = new Date(text.replace(' ', 'T'));
      return Number.isNaN(d.getTime()) ? INVALID : { date: d, invalid: false };
    }
    const d = validDate(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return d ? { date: d, invalid: false } : INVALID;
  }

  m = YMD_SLASH_RE.exec(text);
  if (m) {
    const d = validDate(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return d ? { date: d, invalid: false } : INVALID;
  }

  m = NUMERIC_RE.exec(text);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const year = expandYear(+m[3], m[3].length);
    const [month, day] = order === 'MDY' ? [a, b] : [b, a];
    const hours = m[4] ? to24h(+m[4], m[7]) : 0;
    const d = validDate(year, month, day, hours, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return d ? { date: d, invalid: false } : INVALID;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    // Only plausible serials (1954..2119) are accepted from text, to avoid reading IDs as dates.
    if (serial >= 20000 && serial <= 80000) {
      const d = excelSerialToDate(serial);
      return d ? { date: d, invalid: false } : INVALID;
    }
    return INVALID;
  }

  if (/[a-z]{3}/i.test(text)) {
    const parsed = Date.parse(text.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/-/g, ' '));
    if (!Number.isNaN(parsed)) {
      const d = new Date(parsed);
      if (d.getFullYear() >= 1900 && d.getFullYear() <= 2200) return { date: d, invalid: false };
    }
  }
  return INVALID;
}
