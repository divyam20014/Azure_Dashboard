import { useMemo } from 'react';
import type { Dataset } from '@/types/analytics';
import { applyCountingRule, applyCriteria, displayFilterValue, FILTER_FIELD_LABELS, FILTER_FIELDS, searchRecords } from '@/lib/analytics/filters';
import { computeAggregates } from '@/lib/analytics/aggregate';
import { computeClosure, computeKpis } from '@/lib/analytics/statusAnalytics';
import { generateSummary } from '@/lib/analytics/summaryGenerator';
import { priorityColors } from '@/lib/normalization/priorityNormalizer';
import { useDebouncedValue } from './useDebouncedValue';
import type { FilterState } from './useFilters';

/**
 * Derives everything the dashboard shows from one in-memory dataset.
 * Pipeline: records -> counting rule -> global filters (= scope for every section)
 *           -> chart selection + search (= issue register only).
 * Each stage is memoized so UI interactions recompute only what changed.
 */
export function useAnalytics(dataset: Dataset, filters: FilterState) {
  const values = dataset.config.values;
  const counted = useMemo(() => applyCountingRule(dataset.records, filters.countingRule), [dataset.records, filters.countingRule]);
  const scoped = useMemo(() => applyCriteria(counted, filters.global), [counted, filters.global]);
  const agg = useMemo(() => computeAggregates(scoped, values), [scoped, values]);
  const kpis = useMemo(() => computeKpis(agg), [agg]);
  const closure = useMemo(() => computeClosure(agg, values), [agg, values]);

  const filterDescription = useMemo(
    () =>
      FILTER_FIELDS.filter((f) => filters.global[f]?.length)
        .map((f) => `${FILTER_FIELD_LABELS[f]} = ${filters.global[f]!.map((v) => displayFilterValue(f, v)).join(' / ')}`)
        .join('; '),
    [filters.global],
  );

  const summary = useMemo(
    () =>
      generateSummary({
        agg,
        values,
        mapping: dataset.config.columnMapping,
        quality: dataset.quality,
        countingRule: filters.countingRule,
        filterDescription,
      }),
    [agg, values, dataset.config.columnMapping, dataset.quality, filters.countingRule, filterDescription],
  );

  const debouncedSearch = useDebouncedValue(filters.search, 250);
  const selected = useMemo(() => applyCriteria(scoped, filters.selection?.criteria), [scoped, filters.selection]);
  const registerRecords = useMemo(() => searchRecords(selected, debouncedSearch, filters.searchScope), [selected, debouncedSearch, filters.searchScope]);

  const colors = useMemo(() => ({ status: values.statusColors, priority: priorityColors(values.priorityOrder) }), [values]);

  return { counted, scoped, agg, kpis, closure, summary, registerRecords, filterDescription, colors };
}

export type Analytics = ReturnType<typeof useAnalytics>;
