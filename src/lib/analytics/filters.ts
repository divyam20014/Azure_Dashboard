import type { IssueRecord } from '@/types/issue';
import { BLANK_LABEL } from '@/types/issue';
import type { CountingRule, Criteria, FilterField } from '@/types/analytics';
import { CATEGORY_LABELS } from '@/lib/normalization/statusNormalizer';

export const FILTER_FIELDS: FilterField[] = ['status', 'priority', 'assignee', 'type', 'project', 'area', 'category'];

export const FILTER_FIELD_LABELS: Record<FilterField, string> = {
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  type: 'Work Item Type',
  project: 'Project',
  area: 'Area',
  category: 'Workflow',
};

/** The value a record contributes to a filterable field (blank values become "(Blank)"). */
export function fieldValue(record: IssueRecord, field: FilterField): string {
  switch (field) {
    case 'status':
      return record.status;
    case 'priority':
      return record.priority;
    case 'assignee':
      return record.assignee;
    case 'category':
      return record.statusCategory;
    case 'type':
      return record.type || BLANK_LABEL;
    case 'project':
      return record.project || BLANK_LABEL;
    case 'area':
      return record.area || BLANK_LABEL;
  }
}

export function displayFilterValue(field: FilterField, value: string): string {
  if (field === 'category') return CATEGORY_LABELS[value as keyof typeof CATEGORY_LABELS] ?? value;
  return value;
}

export function isCriteriaEmpty(criteria: Criteria | null | undefined): boolean {
  if (!criteria) return true;
  return FILTER_FIELDS.every((f) => !criteria[f] || criteria[f]!.length === 0);
}

/** Values within a field are OR-ed; fields are AND-ed. */
export function matchesCriteria(record: IssueRecord, criteria: Criteria): boolean {
  for (const field of FILTER_FIELDS) {
    const allowed = criteria[field];
    if (!allowed || allowed.length === 0) continue;
    if (!allowed.includes(fieldValue(record, field))) return false;
  }
  return true;
}

export function applyCriteria(records: IssueRecord[], criteria: Criteria | null | undefined): IssueRecord[] {
  if (isCriteriaEmpty(criteria)) return records;
  const sets = FILTER_FIELDS.map((f) => [f, criteria![f] && criteria![f]!.length ? new Set(criteria![f]) : null] as const).filter(
    (entry): entry is readonly [FilterField, Set<string>] => entry[1] !== null,
  );
  return records.filter((r) => sets.every(([field, allowed]) => allowed.has(fieldValue(r, field))));
}

/** Records included by the counting rule: all imported records, or one record per issue ID. */
export function applyCountingRule(records: IssueRecord[], rule: CountingRule): IssueRecord[] {
  if (rule === 'all') return records;
  return records.filter((r) => !r.isDuplicateId || r.isFirstOfId);
}

/** Distinct values (with counts) for a field, most frequent first. */
export function distinctValues(records: IssueRecord[], field: FilterField): { value: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const v = fieldValue(r, field);
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export type SearchScope = 'all' | 'id' | 'title' | 'assignee';

export function searchRecords(records: IssueRecord[], query: string, scope: SearchScope): IssueRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return records;
  return records.filter((r) => {
    if (scope === 'id') return r.id.toLowerCase().includes(q);
    if (scope === 'title') return r.title.toLowerCase().includes(q);
    if (scope === 'assignee') return r.assignee.toLowerCase().includes(q);
    return (
      r.id.toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.assignee.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q) ||
      r.priority.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q) ||
      r.project.toLowerCase().includes(q) ||
      r.area.toLowerCase().includes(q) ||
      r.tags.toLowerCase().includes(q)
    );
  });
}
