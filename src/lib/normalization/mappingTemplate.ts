import { LOGICAL_FIELDS, type ColumnMapping, type DateOrder, type SetupConfig, type ValueMappings } from '@/types/mappings';

export interface MappingTemplate {
  version: 1;
  headers: string[];
  columnMapping: ColumnMapping;
  values: ValueMappings;
  dateOrder: DateOrder;
}

/** Serializable mapping template: reused by name-matching, never by position. */
export function buildMappingTemplate(headers: string[], config: SetupConfig): MappingTemplate {
  return { version: 1, headers, columnMapping: config.columnMapping, values: config.values, dateOrder: config.dateOrder };
}

function isColumnMapping(v: unknown): v is ColumnMapping {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return LOGICAL_FIELDS.every((f) => o[f] === null || typeof o[f] === 'number');
}

function isValueMappings(v: unknown): v is ValueMappings {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.status === 'object' &&
    o.status !== null &&
    typeof o.priority === 'object' &&
    o.priority !== null &&
    typeof o.assignee === 'object' &&
    o.assignee !== null &&
    Array.isArray(o.priorityOrder) &&
    Array.isArray(o.highPriority) &&
    typeof o.statusColors === 'object' &&
    o.statusColors !== null
  );
}

/** Parse and loosely validate a mapping template file. Returns null when the shape is not recognizable. */
export function parseMappingTemplate(text: string): MappingTemplate | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.headers) || !o.headers.every((h) => typeof h === 'string')) return null;
  if (!isColumnMapping(o.columnMapping)) return null;
  if (!isValueMappings(o.values)) return null;
  if (o.dateOrder !== 'MDY' && o.dateOrder !== 'DMY') return null;
  return { version: 1, headers: o.headers, columnMapping: o.columnMapping, values: o.values, dateOrder: o.dateOrder };
}
