import type { IssueRecord, DateField } from '@/types/issue';
import { FIELD_LABELS, LOGICAL_FIELDS, type ColumnMapping, type SetupConfig } from '@/types/mappings';
import { normKey } from '@/lib/text';

export type QualityCategory =
  | 'Blank row'
  | 'Missing issue ID'
  | 'Duplicate issue ID'
  | 'Missing status'
  | 'Missing assignee'
  | 'Missing priority'
  | 'Invalid date'
  | 'Future date'
  | 'Unmapped status'
  | 'Unmapped priority';

/** Importance of a finding: errors break core metrics, warnings reduce accuracy, info is cosmetic. */
export type QualitySeverity = 'Error' | 'Warning' | 'Info';

export const CATEGORY_SEVERITY: Record<QualityCategory, QualitySeverity> = {
  'Blank row': 'Info',
  'Missing issue ID': 'Error',
  'Duplicate issue ID': 'Warning',
  'Missing status': 'Error',
  'Missing assignee': 'Warning',
  'Missing priority': 'Warning',
  'Invalid date': 'Warning',
  'Future date': 'Warning',
  'Unmapped status': 'Warning',
  'Unmapped priority': 'Warning',
};

export interface QualityIssue {
  sourceRow: number;
  issueId: string;
  category: QualityCategory;
  severity: QualitySeverity;
  explanation: string;
  recommendation: string;
}

export interface DataQualityReport {
  totalImportedRows: number;
  blankRows: number;
  validRecords: number;
  missingIds: number;
  /** Records whose ID is shared with at least one other record. */
  duplicateIdRecords: number;
  /** Distinct IDs that occur more than once. */
  duplicateIdValues: number;
  /** Records that would be dropped by "exclude duplicate IDs" (all but the first per ID). */
  duplicateExtraRecords: number;
  missingStatuses: number;
  missingAssignees: number;
  missingPriorities: number;
  /** Records with at least one unparseable date. */
  invalidDates: number;
  /** Records with a date later than the end of the validation day (e.g. a Created Date in the future). */
  futureDates: number;
  /** Validation time used for the future-date check. */
  checkedAt: Date;
  unmappedStatusRecords: number;
  unmappedStatusValues: string[];
  unmappedPriorityRecords: number;
  unmappedPriorityValues: string[];
  unrecognizedColumns: string[];
  duplicateHeaders: string[];
  /** Checks that could not run because the column is not mapped. */
  skippedChecks: string[];
  issues: QualityIssue[];
  /** Distinct source rows that have at least one problem (blank rows included). */
  rowsNeedingAttention: number;
  countsByCategory: Record<QualityCategory, number>;
}

const DATE_LABELS: Record<DateField, string> = { created: 'Created Date', updated: 'Updated Date', closed: 'Closed Date' };

export const QUALITY_CATEGORIES: QualityCategory[] = [
  'Blank row',
  'Missing issue ID',
  'Duplicate issue ID',
  'Missing status',
  'Missing assignee',
  'Missing priority',
  'Invalid date',
  'Future date',
  'Unmapped status',
  'Unmapped priority',
];

export interface QualityInput {
  records: IssueRecord[];
  blankRows: number[];
  totalDataRows: number;
  headers: string[];
  duplicateHeaders: string[];
  config: SetupConfig;
  /** Validation time for the future-date check (defaults to now). */
  now?: Date;
}

function mapped(mapping: ColumnMapping, field: keyof ColumnMapping): boolean {
  return mapping[field] !== null;
}

/** Validate imported records without modifying them. */
export function computeDataQuality(input: QualityInput): DataQualityReport {
  const { records, blankRows, config } = input;
  const mapping = config.columnMapping;
  const issues: QualityIssue[] = [];
  const counts = Object.fromEntries(QUALITY_CATEGORIES.map((c) => [c, 0])) as Record<QualityCategory, number>;
  const add = (issue: Omit<QualityIssue, 'severity'>) => {
    issues.push({ ...issue, severity: CATEGORY_SEVERITY[issue.category] });
    counts[issue.category]++;
  };
  const checkedAt = input.now ?? new Date();
  const endOfToday = new Date(checkedAt.getFullYear(), checkedAt.getMonth(), checkedAt.getDate(), 23, 59, 59, 999).getTime();

  for (const row of blankRows) {
    add({
      sourceRow: row,
      issueId: '',
      category: 'Blank row',
      explanation: 'Every cell in this row is empty. It is not counted as an issue.',
      recommendation: 'No action needed, or delete the empty row in the source file.',
    });
  }

  const hasId = mapped(mapping, 'id');
  const hasStatus = mapped(mapping, 'status');
  const hasAssignee = mapped(mapping, 'assignee');
  const hasPriority = mapped(mapping, 'priority');

  let missingIds = 0;
  let duplicateIdRecords = 0;
  let duplicateExtraRecords = 0;
  let missingStatuses = 0;
  let missingAssignees = 0;
  let missingPriorities = 0;
  let invalidDates = 0;
  let futureDates = 0;
  let unmappedStatusRecords = 0;
  let unmappedPriorityRecords = 0;
  const duplicateIds = new Set<string>();
  const unmappedStatusValues = new Set<string>();
  const unmappedPriorityValues = new Set<string>();
  const rowsWithIssues = new Set<number>(blankRows);

  for (const rec of records) {
    const base = { sourceRow: rec.sourceRow, issueId: rec.id };
    const before = issues.length;
    if (hasId && !rec.id) {
      missingIds++;
      add({ ...base, category: 'Missing issue ID', explanation: 'The issue ID cell is empty.', recommendation: 'Add the work item ID so the record can be traced.' });
    }
    if (rec.isDuplicateId) {
      duplicateIdRecords++;
      duplicateIds.add(rec.id);
      if (!rec.isFirstOfId) duplicateExtraRecords++;
      add({
        ...base,
        category: 'Duplicate issue ID',
        explanation: `ID "${rec.id}" appears on more than one row${rec.isFirstOfId ? ' (first occurrence)' : ''}.`,
        recommendation: 'Remove repeated rows from the export, or use "Exclude duplicate IDs" to count each ID once.',
      });
    }
    if (hasStatus && !rec.statusRaw) {
      missingStatuses++;
      add({ ...base, category: 'Missing status', explanation: 'The status cell is empty.', recommendation: 'Set the current workflow state in the source tracker.' });
    } else if (hasStatus && rec.statusCategory === 'unmapped') {
      unmappedStatusRecords++;
      unmappedStatusValues.add(rec.status);
      add({
        ...base,
        category: 'Unmapped status',
        explanation: `Status "${rec.statusRaw}" has no workflow category (Open / Closed).`,
        recommendation: 'Classify this status in Edit Mappings > Values.',
      });
    }
    if (hasAssignee && !rec.assigneeRaw) {
      missingAssignees++;
      add({ ...base, category: 'Missing assignee', explanation: 'The assignee cell is empty; the issue is counted as Unassigned.', recommendation: 'Assign an owner in the source tracker.' });
    }
    if (hasPriority) {
      if (!rec.priorityRaw) {
        missingPriorities++;
        add({ ...base, category: 'Missing priority', explanation: 'The priority cell is empty.', recommendation: 'Set a priority in the source tracker.' });
      } else {
        const rule = config.values.priority[normKey(rec.priorityRaw)];
        if (rule && !rule.confirmed) {
          unmappedPriorityRecords++;
          unmappedPriorityValues.add(rec.priorityRaw);
          add({
            ...base,
            category: 'Unmapped priority',
            explanation: `Priority "${rec.priorityRaw}" is not a recognized priority level.`,
            recommendation: 'Confirm or relabel this priority in Edit Mappings > Values.',
          });
        }
      }
    }
    if (rec.invalidDates.length > 0) {
      invalidDates++;
      const fields = rec.invalidDates.map((f) => DATE_LABELS[f]).join(', ');
      add({
        ...base,
        category: 'Invalid date',
        explanation: `${fields} could not be read as a date.`,
        recommendation: 'Use a consistent date format (e.g. YYYY-MM-DD) or change the date order setting.',
      });
    }
    const future = (['created', 'updated', 'closed'] as const).filter((f) => {
      const d = rec[f];
      return d !== null && d.getTime() > endOfToday;
    });
    if (future.length > 0) {
      futureDates++;
      add({
        ...base,
        category: 'Future date',
        explanation: `${future.map((f) => DATE_LABELS[f]).join(', ')} is later than today (${checkedAt.toLocaleDateString()}).`,
        recommendation: 'Check the date in the source tracker; age-based analysis ignores this record.',
      });
    }
    if (issues.length > before) rowsWithIssues.add(rec.sourceRow);
  }

  const mappedColumns = new Set(LOGICAL_FIELDS.map((f) => mapping[f]).filter((c): c is number => c !== null));
  const unrecognizedColumns = input.headers.filter((_, i) => !mappedColumns.has(i));

  const skippedChecks: string[] = [];
  if (!hasId) skippedChecks.push(`${FIELD_LABELS.id}: not mapped — missing and duplicate ID checks were skipped.`);
  if (!hasStatus) skippedChecks.push(`${FIELD_LABELS.status}: not mapped — status checks were skipped.`);
  if (!hasAssignee) skippedChecks.push(`${FIELD_LABELS.assignee}: not mapped — assignee checks were skipped.`);
  if (!hasPriority) skippedChecks.push(`${FIELD_LABELS.priority}: not mapped — priority checks were skipped.`);

  issues.sort((a, b) => a.sourceRow - b.sourceRow);

  return {
    totalImportedRows: input.totalDataRows,
    blankRows: blankRows.length,
    validRecords: records.length,
    missingIds,
    duplicateIdRecords,
    duplicateIdValues: duplicateIds.size,
    duplicateExtraRecords,
    missingStatuses,
    missingAssignees,
    missingPriorities,
    invalidDates,
    futureDates,
    checkedAt,
    unmappedStatusRecords,
    unmappedStatusValues: [...unmappedStatusValues],
    unmappedPriorityRecords,
    unmappedPriorityValues: [...unmappedPriorityValues],
    unrecognizedColumns,
    duplicateHeaders: input.duplicateHeaders,
    skippedChecks,
    issues,
    rowsNeedingAttention: rowsWithIssues.size,
    countsByCategory: counts,
  };
}
