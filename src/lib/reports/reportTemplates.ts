import type { ColumnMapping } from '@/types/mappings';
import type { ExecutiveMetrics } from '@/lib/analytics/executiveMetrics';
import { formatCount } from '@/lib/text';

export type ReportTemplateId = 'daily' | 'weekly' | 'release' | 'workload';

export type ReportSectionId = 'summary' | 'status' | 'priority' | 'assignee' | 'risks' | 'aging' | 'quality' | 'register' | 'comparison' | 'readiness';

export const REPORT_SECTIONS: { id: ReportSectionId; label: string; description: string }[] = [
  { id: 'summary', label: 'Executive summary and KPIs', description: 'Headline figures and the rule-based summary.' },
  { id: 'readiness', label: 'Release readiness indicators', description: 'Issue-based indicators and any release criteria you set.' },
  { id: 'status', label: 'Status distribution', description: 'Issues per status and workflow category.' },
  { id: 'priority', label: 'Priority-wise analysis', description: 'Priority distribution, open backlog by priority, high-priority issues.' },
  { id: 'assignee', label: 'Assignee workload and priority matrix', description: 'Per-assignee totals, open/closed, high-priority, heatmap.' },
  { id: 'risks', label: 'Risks and attention items', description: 'High-priority backlog, reopened, aging, unassigned, incomplete, QA queue.' },
  { id: 'aging', label: 'Aging analysis', description: 'Age since creation of open issues.' },
  { id: 'quality', label: 'Data-quality report', description: 'Score, rule breakdown and findings.' },
  { id: 'register', label: 'Detailed issue register', description: 'The records in the report scope.' },
  { id: 'comparison', label: 'Snapshot comparison', description: 'Changes against a previously loaded snapshot.' },
];

export interface ReportTemplate {
  id: ReportTemplateId;
  title: string;
  description: string;
  sections: ReportSectionId[];
}

export const REPORT_TEMPLATES: Record<ReportTemplateId, ReportTemplate> = {
  daily: {
    id: 'daily',
    title: 'Daily QA Status Report',
    description: 'Current KPIs, status and priority distribution, open and high-priority backlog, reopened issues, QA queue, unassigned issues and key data-quality findings.',
    sections: ['summary', 'status', 'priority', 'risks', 'quality'],
  },
  weekly: {
    id: 'weekly',
    title: 'Weekly Management Report',
    description: 'Executive summary, KPIs, status and priority backlog, assignee workload and matrix, risks and data quality. Week-on-week changes appear only when a comparison snapshot is loaded.',
    sections: ['summary', 'status', 'priority', 'assignee', 'risks', 'quality', 'comparison'],
  },
  release: {
    id: 'release',
    title: 'Release Readiness Report',
    description: 'Issue-based readiness indicators: open and high-priority backlog, reopened issues, QA queue, blocked and aging issues, data-quality limitations. Not a formal release approval.',
    sections: ['summary', 'readiness', 'priority', 'risks', 'aging', 'quality'],
  },
  workload: {
    id: 'workload',
    title: 'Developer / Tester Workload Report',
    description: 'Assignee-wise total, open and closed workload, high-priority distribution, reopened and QA-ready issues, the heatmap and the issue register for the selected assignees.',
    sections: ['assignee', 'register'],
  },
};

/** Optional thresholds for the release report. Unset values are not evaluated. */
export interface ReleaseCriteria {
  maxHighPriorityOpen: number | null;
  maxOpenBacklog: number | null;
  maxReopened: number | null;
  maxUnassigned: number | null;
}

export interface ReportOptions {
  template: ReportTemplateId;
  sections: ReportSectionId[];
  /** Workload report: assignees to include (empty = all in scope). */
  assignees: string[];
  /** Maximum issue-register rows in the printed report (the Excel report always has all). */
  registerLimit: number;
  /** Start major sections on a new printed page. */
  pageBreaks: boolean;
  releaseCriteria: ReleaseCriteria;
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  template: 'daily',
  sections: REPORT_TEMPLATES.daily.sections,
  assignees: [],
  registerLimit: 200,
  pageBreaks: true,
  releaseCriteria: { maxHighPriorityOpen: null, maxOpenBacklog: null, maxReopened: null, maxUnassigned: null },
};

export interface AvailabilityContext {
  mapping: ColumnMapping;
  hasComparison: boolean;
  agingAvailable: boolean;
  agingReason?: string;
}

/** Whether a section can be produced from the data; unsupported sections are never included. */
export function sectionAvailability(id: ReportSectionId, ctx: AvailabilityContext): { available: boolean; reason?: string } {
  const m = ctx.mapping;
  switch (id) {
    case 'status':
      return m.status !== null ? { available: true } : { available: false, reason: 'Status column not mapped.' };
    case 'priority':
      return m.priority !== null ? { available: true } : { available: false, reason: 'Priority column not mapped.' };
    case 'assignee':
      return m.assignee !== null ? { available: true } : { available: false, reason: 'Assignee column not mapped.' };
    case 'readiness':
      return m.status !== null ? { available: true } : { available: false, reason: 'Status column not mapped.' };
    case 'aging':
      return ctx.agingAvailable ? { available: true } : { available: false, reason: ctx.agingReason ?? 'Aging analysis unavailable.' };
    case 'comparison':
      return ctx.hasComparison ? { available: true } : { available: false, reason: 'No comparison snapshot loaded.' };
    default:
      return { available: true };
  }
}

/** Selected sections that can actually be produced, in the canonical order. */
export function effectiveSections(selected: ReportSectionId[], ctx: AvailabilityContext): ReportSectionId[] {
  const chosen = new Set(selected);
  return REPORT_SECTIONS.map((s) => s.id).filter((id) => chosen.has(id) && sectionAvailability(id, ctx).available);
}

export interface CriterionResult {
  label: string;
  actual: number;
  limit: number;
  met: boolean;
}

/** Evaluate only the criteria the user set. No criteria → no verdict. */
export function evaluateReleaseCriteria(criteria: ReleaseCriteria, metrics: ExecutiveMetrics): CriterionResult[] {
  const rows: CriterionResult[] = [];
  const add = (label: string, actual: number, limit: number | null) => {
    if (limit === null || !Number.isFinite(limit)) return;
    rows.push({ label, actual, limit, met: actual <= limit });
  };
  add(`Open high-priority issues (${metrics.highPriorityOpen.group.join(', ') || 'not configured'})`, metrics.highPriorityOpen.count, criteria.maxHighPriorityOpen);
  add('Open backlog', metrics.openBacklog.count, criteria.maxOpenBacklog);
  add('Reopened issues', metrics.reopened.count, criteria.maxReopened);
  add('Unassigned issues', metrics.unassigned.count, criteria.maxUnassigned);
  return rows;
}

export function readinessStatement(results: CriterionResult[]): string {
  if (results.length === 0) {
    return 'No release criteria have been configured. This report provides issue-based indicators only; it is not a formal release approval.';
  }
  const unmet = results.filter((r) => !r.met);
  if (unmet.length === 0) return `All ${results.length} configured criteria are met by the current data. This is an indicator, not a formal release approval.`;
  return `${unmet.length} of ${results.length} configured criteria are not met (${unmet.map((r) => `${r.label}: ${formatCount(r.actual)} > ${formatCount(r.limit)}`).join('; ')}). This is an indicator, not a formal release approval.`;
}
