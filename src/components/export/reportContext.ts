import { useMemo } from 'react';
import { computeAggregates } from '@/lib/analytics/aggregate';
import { effectiveSections, REPORT_TEMPLATES, type AvailabilityContext } from '@/lib/reports/reportTemplates';
import type { ReportContext } from '@/lib/reports/reportWorkbook';
import { useDashboard } from '@/components/dashboard/DashboardContext';

/**
 * Everything a report needs, derived from the same analytics as the dashboard. The
 * workload template narrows the assignee section and register to the chosen assignees.
 */
export function useReportModel() {
  const { analytics, dataset, settings, comparison } = useDashboard();
  const options = settings.settings.report;
  const availability: AvailabilityContext = {
    mapping: dataset.config.columnMapping,
    hasComparison: analytics.comparison !== null,
    agingAvailable: analytics.aging.available,
    agingReason: analytics.aging.reason,
  };
  const sections = effectiveSections(options.sections, availability);
  const assigneeKey = options.template === 'workload' && options.assignees.length > 0 ? JSON.stringify(options.assignees) : '';
  const assigneeRecords = useMemo(() => {
    if (!assigneeKey) return null;
    const set = new Set(JSON.parse(assigneeKey) as string[]);
    return analytics.scoped.filter((r) => set.has(r.assignee));
  }, [analytics.scoped, assigneeKey]);
  const assigneeAgg = useMemo(() => (assigneeRecords ? computeAggregates(assigneeRecords, dataset.config.values) : null), [assigneeRecords, dataset.config.values]);

  const ctx: ReportContext = {
    dataset,
    agg: analytics.agg,
    executive: analytics.executive,
    summary: analytics.summary,
    risks: analytics.risks,
    aging: analytics.aging,
    qualityScore: analytics.qualityScore,
    records: analytics.scoped,
    assigneeAgg: assigneeAgg ?? undefined,
    assigneeRecords: assigneeRecords ?? undefined,
    comparison: analytics.comparison && comparison.snapshot ? { result: analytics.comparison, previousName: comparison.snapshot.fileName } : null,
    filterDescription: analytics.filterDescription,
  };

  /** Limitations a reader must see alongside the figures. */
  const limitations: string[] = [];
  const m = analytics.executive;
  if (!m.statusMapped) limitations.push('Status is not mapped: status, backlog and closure figures are unavailable.');
  else if (m.unmappedStatus.count > 0) limitations.push(`${m.unmappedStatus.count} record(s) have unmapped statuses (${m.unmappedStatus.values.join(', ')}); open and closed totals are provisional.`);
  if (!m.priorityMapped) limitations.push('Priority is not mapped: priority figures are unavailable.');
  else if (!m.highPriorityOpen.configured) limitations.push('No high-priority group is configured.');
  if (m.highPriorityOpen.numericConvention) limitations.push('Numeric priorities were read as P-levels (1 → P1).');
  if (dataset.quality.unmappedPriorityRecords > 0) limitations.push(`${dataset.quality.unmappedPriorityRecords} record(s) have unconfirmed priority values.`);
  if (m.scopes.excluded > 0) limitations.push(`${m.scopes.excluded} duplicate-ID record(s) are excluded by the duplicate-handling rule.`);
  else if (dataset.quality.duplicateIdRecords > 0) limitations.push(`${dataset.quality.duplicateIdRecords} records share an issue ID and are all counted.`);
  for (const s of dataset.quality.skippedChecks) limitations.push(s);
  limitations.push('All figures are a snapshot of current states in the file, not historical trends.');

  return { options, sections, availability, ctx, template: REPORT_TEMPLATES[options.template], limitations };
}
