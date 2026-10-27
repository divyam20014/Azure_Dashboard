import type { IssueRecord } from '@/types/issue';
import { BLANK_LABEL, NO_PRIORITY_LABEL, NO_STATUS_LABEL, UNASSIGNED_LABEL } from '@/types/issue';
import type { Dataset } from '@/types/analytics';
import { LOGICAL_FIELDS } from '@/types/mappings';
import { fieldValue } from '@/lib/analytics/filters';
import { CATEGORY_LABELS, CORE_STATUSES } from '@/lib/normalization/statusNormalizer';
import { cellToString, cleanText, formatDate } from '@/lib/text';
import type { DimensionId } from './chartConfig';

export interface DimensionDef {
  id: DimensionId;
  label: string;
  available: boolean;
  reason?: string;
  /** Categories have a meaningful built-in order (priority mapping, workflow, time). */
  ordered: boolean;
  /** Ordered in time (suitable for line / area charts). */
  temporal: boolean;
}

/** Imported columns are offered as a grouping only when they look categorical. */
export const MAX_CUSTOM_CATEGORIES = 200;
export const NO_CREATED_LABEL = '(No Created Date)';
export const INVALID_DATE_LABEL = '(Invalid Created Date)';

const FIELD_DIMENSIONS: { id: DimensionId; label: string; field: 'assignee' | 'priority' | 'status' | 'type' | 'project' | 'area' | 'iteration' | 'severity'; ordered: boolean }[] = [
  { id: 'assignee', label: 'Assignee', field: 'assignee', ordered: false },
  { id: 'priority', label: 'Priority', field: 'priority', ordered: true },
  { id: 'status', label: 'State', field: 'status', ordered: true },
  { id: 'type', label: 'Work Item Type', field: 'type', ordered: false },
  { id: 'project', label: 'Project', field: 'project', ordered: false },
  { id: 'area', label: 'Area Path / Module', field: 'area', ordered: false },
  { id: 'iteration', label: 'Iteration / Sprint', field: 'iteration', ordered: false },
  { id: 'severity', label: 'Severity', field: 'severity', ordered: false },
];

/** Dimensions for this dataset; unavailable ones carry the reason (never shown as if present). */
export function availableDimensions(dataset: Dataset): DimensionDef[] {
  const m = dataset.config.columnMapping;
  const dims: DimensionDef[] = FIELD_DIMENSIONS.map((d) => ({
    id: d.id,
    label: d.label,
    ordered: d.ordered,
    temporal: false,
    available: m[d.field] !== null,
    reason: m[d.field] !== null ? undefined : `No ${d.label} column is mapped.`,
  }));
  dims.splice(3, 0, {
    id: 'category',
    label: 'Workflow category (Open / Closed)',
    ordered: true,
    temporal: false,
    available: m.status !== null,
    reason: m.status !== null ? undefined : 'No State column is mapped.',
  });
  const hasDates = m.created !== null && dataset.records.some((r) => r.created !== null);
  const dateReason = m.created === null ? 'No Created Date column is mapped.' : 'No record has a valid Created Date.';
  dims.push({ id: 'createdMonth', label: 'Created month', ordered: true, temporal: true, available: hasDates, reason: hasDates ? undefined : dateReason });
  dims.push({ id: 'createdWeek', label: 'Created week (Monday)', ordered: true, temporal: true, available: hasDates, reason: hasDates ? undefined : dateReason });

  // Imported columns not mapped to a field, offered when they look categorical.
  const mapped = new Set(LOGICAL_FIELDS.map((f) => m[f]).filter((c): c is number => c !== null));
  dataset.headers.forEach((header, col) => {
    if (mapped.has(col)) return;
    const distinct = new Set<string>();
    for (const r of dataset.records) {
      distinct.add(cleanText(cellToString(r.cells[col] ?? null)));
      if (distinct.size > MAX_CUSTOM_CATEGORIES) break;
    }
    const nonBlank = [...distinct].filter(Boolean).length;
    if (nonBlank === 0 || distinct.size > MAX_CUSTOM_CATEGORIES) return;
    dims.push({ id: `column:${col}`, label: `Column: ${header}`, ordered: false, temporal: false, available: true });
  });
  return dims;
}

function mondayOf(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

/** The category key a record falls into for a dimension (blank values have explicit labels). */
export function dimensionKey(record: IssueRecord, dim: DimensionId): string {
  switch (dim) {
    case 'assignee':
    case 'priority':
    case 'status':
    case 'type':
    case 'project':
    case 'area':
    case 'iteration':
    case 'severity':
    case 'category':
      return fieldValue(record, dim);
    case 'createdMonth':
    case 'createdWeek': {
      if (record.invalidDates.includes('created')) return INVALID_DATE_LABEL;
      if (!record.created) return NO_CREATED_LABEL;
      return dim === 'createdMonth' ? formatDate(record.created).slice(0, 7) : formatDate(mondayOf(record.created));
    }
    default: {
      const col = Number(dim.slice('column:'.length));
      return cleanText(cellToString(record.cells[col] ?? null)) || BLANK_LABEL;
    }
  }
}

/** Display label for a category key. */
export function categoryLabel(dim: DimensionId, key: string): string {
  if (dim === 'category') return CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] ?? key;
  if (dim === 'createdWeek' && /^\d{4}-\d{2}-\d{2}$/.test(key)) return `Week of ${key}`;
  return key;
}

const SPECIAL_LAST = new Set([BLANK_LABEL, NO_STATUS_LABEL, NO_PRIORITY_LABEL, UNASSIGNED_LABEL, NO_CREATED_LABEL, INVALID_DATE_LABEL]);

/** The dimension's own order: configured priority order, workflow order, chronological, or A–Z. */
export function naturalCompare(dim: DimensionId, priorityOrder: string[]): (a: string, b: string) => number {
  const special = (a: string, b: string) => Number(SPECIAL_LAST.has(a)) - Number(SPECIAL_LAST.has(b));
  if (dim === 'priority') {
    const rank = new Map(priorityOrder.map((l, i) => [l, i]));
    return (a, b) => (rank.get(a) ?? 9999) - (rank.get(b) ?? 9999) || a.localeCompare(b);
  }
  if (dim === 'status') {
    const core = CORE_STATUSES as readonly string[];
    const rank = (s: string) => (core.includes(s) ? core.indexOf(s) : 100);
    return (a, b) => special(a, b) || rank(a) - rank(b) || a.localeCompare(b);
  }
  if (dim === 'category') {
    const order = ['open', 'closed', 'unmapped'];
    return (a, b) => order.indexOf(a) - order.indexOf(b);
  }
  return (a, b) => special(a, b) || a.localeCompare(b, undefined, { numeric: true });
}

/** Category keys that are unmapped / unknown for the dimension (kept visible, flagged). */
export function isUnmappedCategory(dim: DimensionId, key: string, dataset: Dataset): boolean {
  if (dim === 'category') return key === 'unmapped';
  if (dim === 'status') return key === NO_STATUS_LABEL || Object.values(dataset.config.values.status).some((r) => r.label === key && r.category === 'unmapped');
  if (dim === 'priority') return key === NO_PRIORITY_LABEL || Object.values(dataset.config.values.priority).some((r) => r.label === key && !r.confirmed);
  return false;
}
