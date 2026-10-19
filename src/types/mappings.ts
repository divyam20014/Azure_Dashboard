import type { WorkflowCategory } from './issue';

export const LOGICAL_FIELDS = [
  'id',
  'title',
  'status',
  'assignee',
  'priority',
  'severity',
  'type',
  'created',
  'updated',
  'closed',
  'reporter',
  'project',
  'area',
  'iteration',
  'tags',
  'resolution',
  'developer',
  'environment',
] as const;

export type LogicalField = (typeof LOGICAL_FIELDS)[number];

/** Logical field -> zero-based source column index (null = not mapped). */
export type ColumnMapping = Record<LogicalField, number | null>;

export const FIELD_LABELS: Record<LogicalField, string> = {
  id: 'Issue ID',
  title: 'Title',
  status: 'Status',
  assignee: 'Assignee',
  priority: 'Priority',
  severity: 'Severity',
  type: 'Work Item Type',
  created: 'Created Date',
  updated: 'Updated Date',
  closed: 'Closed Date',
  reporter: 'Reporter',
  project: 'Project',
  area: 'Area / Module',
  iteration: 'Iteration / Sprint',
  tags: 'Tags',
  resolution: 'Resolution',
  developer: 'Developer',
  environment: 'Environment',
};

/** Fields the complete dashboard depends on. */
export const ESSENTIAL_FIELDS: LogicalField[] = ['status', 'assignee', 'priority'];

/** What becomes unavailable when an essential field is missing. */
export const ESSENTIAL_FIELD_IMPACT: Record<string, string> = {
  status: 'KPI status cards, status charts, closure percentage, backlog and handoff analysis',
  assignee: 'assignee workload, assignee-by-status / priority charts and the assignee-priority matrix',
  priority: 'priority analysis, backlog by priority, high-priority table and the assignee-priority matrix',
};

export interface StatusRule {
  /** Case/whitespace-insensitive key of the source value ('' for blank). */
  key: string;
  /** Source value as first seen (trimmed). */
  sourceLabel: string;
  /** Normalized status label shown in the dashboard. */
  label: string;
  category: WorkflowCategory;
  /** Category the app would suggest; only applied when the user asks. */
  suggestedCategory: WorkflowCategory | null;
  count: number;
}

export interface PriorityRule {
  key: string;
  sourceLabel: string;
  label: string;
  /** Recognized automatically or confirmed by the user. Unconfirmed values are reported as unmapped. */
  confirmed: boolean;
  /** True when the label was derived from a bare number (e.g. "1" -> "P1"). */
  numeric: boolean;
  count: number;
}

export interface AssigneeRule {
  key: string;
  sourceLabel: string;
  label: string;
  unassigned: boolean;
  count: number;
}

export type DateOrder = 'MDY' | 'DMY';

export interface ValueMappings {
  status: Record<string, StatusRule>;
  priority: Record<string, PriorityRule>;
  /** Priority labels in display / severity order (first = highest). */
  priorityOrder: string[];
  /** Priority labels that form the high-priority group. */
  highPriority: string[];
  assignee: Record<string, AssigneeRule>;
  /** Normalized status label -> color. */
  statusColors: Record<string, string>;
}

export interface SetupConfig {
  sheetName: string;
  headerRowIndex: number;
  columnMapping: ColumnMapping;
  values: ValueMappings;
  dateOrder: DateOrder;
}
