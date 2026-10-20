import { useCallback, useMemo, useState } from 'react';
import type { CountingRule, Criteria, FilterField, Selection } from '@/types/analytics';
import type { SearchScope } from '@/lib/analytics/filters';
import { isCriteriaEmpty } from '@/lib/analytics/filters';

export interface FilterState {
  /** Global filters: change the scope of every dashboard section. */
  global: Criteria;
  /** Inclusive Created Date range (yyyy-mm-dd, '' = open); part of the global scope. */
  createdFrom: string;
  createdTo: string;
  /** Chart / KPI / risk selection: narrows the issue register only. */
  selection: Selection | null;
  countingRule: CountingRule;
  /** record.index values excluded while countingRule = 'review'. */
  reviewExcluded: ReadonlySet<number>;
  search: string;
  searchScope: SearchScope;
}

const EMPTY_SET: ReadonlySet<number> = new Set();

const INITIAL: FilterState = {
  global: {},
  createdFrom: '',
  createdTo: '',
  selection: null,
  countingRule: 'all',
  reviewExcluded: EMPTY_SET,
  search: '',
  searchScope: 'all',
};

/** All filter state lives in memory only and is reset with the dataset. */
export function useFilters() {
  const [state, setState] = useState<FilterState>(INITIAL);

  const setGlobalField = useCallback((field: FilterField, values: string[]) => {
    setState((s) => ({ ...s, global: { ...s.global, [field]: values } }));
  }, []);

  const setCreatedRange = useCallback((createdFrom: string, createdTo: string) => setState((s) => ({ ...s, createdFrom, createdTo })), []);

  /** Clicking the same KPI / chart element again clears the selection. */
  const toggleSelection = useCallback((selection: Selection) => {
    setState((s) => ({ ...s, selection: s.selection?.source === selection.source ? null : selection }));
  }, []);

  const clearSelection = useCallback(() => setState((s) => ({ ...s, selection: null })), []);

  /** Move the register-only selection into the global filters (record-set selections cannot be promoted). */
  const promoteSelection = useCallback(() => {
    setState((s) => {
      if (!s.selection || s.selection.indexes) return s;
      return { ...s, global: { ...s.global, ...s.selection.criteria }, selection: null };
    });
  }, []);

  const setCountingRule = useCallback((countingRule: CountingRule) => setState((s) => ({ ...s, countingRule })), []);
  const setReviewExcluded = useCallback((reviewExcluded: ReadonlySet<number>) => setState((s) => ({ ...s, reviewExcluded })), []);
  const toggleReviewExcluded = useCallback((index: number) => {
    setState((s) => {
      const next = new Set(s.reviewExcluded);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return { ...s, reviewExcluded: next };
    });
  }, []);
  const setSearch = useCallback((search: string) => setState((s) => ({ ...s, search })), []);
  const setSearchScope = useCallback((searchScope: SearchScope) => setState((s) => ({ ...s, searchScope })), []);

  /** "Clear All Filters": filters, selection and search. The duplicate-handling rule is a counting decision and is kept. */
  const clearAll = useCallback(
    () => setState((s) => ({ ...INITIAL, countingRule: s.countingRule, reviewExcluded: s.reviewExcluded })),
    [],
  );
  const reset = useCallback(() => setState(INITIAL), []);

  const globalActive = !isCriteriaEmpty(state.global) || state.createdFrom !== '' || state.createdTo !== '';
  const hasActiveFilters = useMemo(
    () => globalActive || state.selection !== null || state.search.trim() !== '',
    [globalActive, state.selection, state.search],
  );

  return {
    state,
    setGlobalField,
    setCreatedRange,
    toggleSelection,
    clearSelection,
    promoteSelection,
    setCountingRule,
    setReviewExcluded,
    toggleReviewExcluded,
    setSearch,
    setSearchScope,
    clearAll,
    reset,
    globalActive,
    hasActiveFilters,
  };
}

export type FiltersApi = ReturnType<typeof useFilters>;
