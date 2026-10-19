import type { IssueRecord, ParsedFile, WorkflowCategory } from './issue';
import type { SetupConfig } from './mappings';
import type { DataQualityReport } from '@/lib/analytics/dataQuality';

/** Fields that global filters and chart selections can constrain. */
export type FilterField = 'status' | 'priority' | 'assignee' | 'type' | 'project' | 'area' | 'category';

/** Field -> allowed values. Values within a field are OR-ed, fields are AND-ed. */
export type Criteria = Partial<Record<FilterField, string[]>>;

export interface Selection {
  /** Stable identifier so the originating KPI / chart can highlight itself. */
  source: string;
  label: string;
  criteria: Criteria;
}

export type CountingRule = 'all' | 'unique';

export interface Dataset {
  file: ParsedFile;
  headers: string[];
  duplicateHeaders: string[];
  config: SetupConfig;
  records: IssueRecord[];
  /** Data rows below the header, including blank rows. */
  totalDataRows: number;
  /** 1-based source row numbers of entirely blank rows. */
  blankRows: number[];
  quality: DataQualityReport;
  projectName: string | null;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface StatusCount extends LabelCount {
  category: WorkflowCategory;
}

export interface AssigneeAggregate {
  name: string;
  isUnassigned: boolean;
  total: number;
  open: number;
  closed: number;
  unmapped: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

export interface Aggregates {
  total: number;
  byStatus: StatusCount[];
  statusMap: Record<string, number>;
  byCategory: Record<WorkflowCategory, number>;
  byPriority: LabelCount[];
  priorityMap: Record<string, number>;
  /** priority -> status -> count */
  priorityStatus: Record<string, Record<string, number>>;
  /** priority -> category -> count */
  priorityCategory: Record<string, Record<WorkflowCategory, number>>;
  byAssignee: AssigneeAggregate[];
  byType: LabelCount[];
  unassigned: number;
}
