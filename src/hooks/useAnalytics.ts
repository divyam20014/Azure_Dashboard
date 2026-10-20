import { useMemo } from 'react';
import type { Dataset } from '@/types/analytics';
import {
  applyCountingRule,
  applyCreatedRange,
  applyCriteria,
  applySelection,
  displayFilterValue,
  FILTER_FIELD_LABELS,
  FILTER_FIELDS,
  searchRecords,
} from '@/lib/analytics/filters';
import { computeAggregates } from '@/lib/analytics/aggregate';
import { computeClosure } from '@/lib/analytics/statusAnalytics';
import { calculateExecutiveMetrics, type DatasetScopes } from '@/lib/analytics/executiveMetrics';
import { calculateAssigneeMetrics } from '@/lib/analytics/assigneeAnalytics';
import { calculateRiskIndicators } from '@/lib/analytics/riskAnalytics';
import { calculateDataQualityScore } from '@/lib/analytics/dataQualityScore';
import { compareSnapshots } from '@/lib/analytics/snapshotComparison';
import { generateSummary } from '@/lib/analytics/summaryGenerator';
import { priorityColors } from '@/lib/normalization/priorityNormalizer';
import { useDebouncedValue } from './useDebouncedValue';
import type { FilterState } from './useFilters';
import type { AnalysisSettings } from './useAnalysisSettings';

/**
 * The single analytics pipeline. Every section, report and export reads from here.
 *
 *   dataset.records ──duplicate rule──▶ included ──created range + global filters──▶ scoped
 *        (valid)                                                                       │
 *                                         chart/KPI/risk selection + search ◀──────────┘
 *                                                  ▼
 *                                          registerRecords (issue register only)
 *
 * KPIs, charts, risks, assignee figures and reports use `scoped`; the data-quality
 * score and findings use all valid records. Each stage is memoized.
 */
export function useAnalytics(dataset: Dataset, filters: FilterState, settings: AnalysisSettings, comparisonDataset: Dataset | null = null) {
  const values = dataset.config.values;
  const mapping = dataset.config.columnMapping;

  const included = useMemo(
    () => applyCountingRule(dataset.records, filters.countingRule, filters.reviewExcluded),
    [dataset.records, filters.countingRule, filters.reviewExcluded],
  );
  const dated = useMemo(() => applyCreatedRange(included, filters.createdFrom, filters.createdTo), [included, filters.createdFrom, filters.createdTo]);
  const scoped = useMemo(() => applyCriteria(dated, filters.global), [dated, filters.global]);
  const agg = useMemo(() => computeAggregates(scoped, values), [scoped, values]);
  const closure = useMemo(() => computeClosure(agg, values), [agg, values]);

  const scopes = useMemo<DatasetScopes>(
    () => ({
      imported: dataset.totalDataRows,
      blankRows: dataset.blankRows.length,
      valid: dataset.records.length,
      included: included.length,
      excluded: dataset.records.length - included.length,
      inScope: scoped.length,
      filtered: scoped.length !== included.length,
    }),
    [dataset.totalDataRows, dataset.blankRows.length, dataset.records.length, included.length, scoped.length],
  );

  const executive = useMemo(() => calculateExecutiveMetrics({ agg, values, mapping, scopes }), [agg, values, mapping, scopes]);
  const assigneeMetrics = useMemo(() => calculateAssigneeMetrics(agg, values.highPriority), [agg, values.highPriority]);
  const risk = useMemo(
    () => calculateRiskIndicators({ records: scoped, values, mapping, agingThresholds: settings.agingThresholds }),
    [scoped, values, mapping, settings.agingThresholds],
  );
  const qualityScore = useMemo(
    () => calculateDataQualityScore({ records: dataset.records, mapping, values, weights: settings.qualityWeights, requiredFields: settings.requiredFields, now: dataset.quality.checkedAt }),
    [dataset.records, dataset.quality.checkedAt, mapping, values, settings.qualityWeights, settings.requiredFields],
  );
  const comparison = useMemo(
    () => (comparisonDataset ? compareSnapshots(comparisonDataset.records, included, values) : null),
    [comparisonDataset, included, values],
  );

  const filterDescription = useMemo(() => {
    const parts = FILTER_FIELDS.filter((f) => filters.global[f]?.length).map(
      (f) => `${FILTER_FIELD_LABELS[f]} = ${filters.global[f]!.map((v) => displayFilterValue(f, v)).join(' / ')}`,
    );
    if (filters.createdFrom || filters.createdTo) parts.push(`Created ${filters.createdFrom || '…'} to ${filters.createdTo || '…'}`);
    return parts.join('; ');
  }, [filters.global, filters.createdFrom, filters.createdTo]);

  const summary = useMemo(
    () =>
      generateSummary({
        agg,
        values,
        mapping,
        quality: dataset.quality,
        countingRule: filters.countingRule,
        filterDescription,
        reviewExcluded: scopes.excluded,
        qualityScore: qualityScore.overall,
      }),
    [agg, values, mapping, dataset.quality, filters.countingRule, filterDescription, scopes.excluded, qualityScore.overall],
  );

  const debouncedSearch = useDebouncedValue(filters.search, 250);
  const selected = useMemo(() => applySelection(scoped, filters.selection), [scoped, filters.selection]);
  const registerRecords = useMemo(() => searchRecords(selected, debouncedSearch, filters.searchScope), [selected, debouncedSearch, filters.searchScope]);

  const colors = useMemo(() => ({ status: values.statusColors, priority: priorityColors(values.priorityOrder) }), [values]);

  return {
    included,
    scoped,
    agg,
    scopes,
    executive,
    assigneeMetrics,
    risks: risk.indicators,
    aging: risk.aging,
    qualityScore,
    comparison,
    closure,
    summary,
    registerRecords,
    filterDescription,
    colors,
  };
}

export type Analytics = ReturnType<typeof useAnalytics>;
