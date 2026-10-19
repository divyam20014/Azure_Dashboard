import { useCallback, useMemo, useState } from 'react';
import type { CountingRule, Criteria, FilterField, Selection } from '@/types/analytics';
import type { SearchScope } from '@/lib/analytics/filters';
import { isCriteriaEmpty } from '@/lib/analytics/filters';

export interface FilterState {
  /** Global filters: change the scope of every dashboard section. */
  global: Criteria;
  /** Chart / KPI selection: narrows the issue register only. */
  selection: Selection | null;
  countingRule: CountingRule;
  search: string;
  searchScope: SearchScope;
}

const INITIAL: FilterState = { global: {}, selection: null, countingRule: 'all', search: '', searchScope: 'all' };

export function useFilters() {
  const [state, setState] = useState<FilterState>(INITIAL);

  const setGlobalField = useCallback((field: FilterField, values: string[]) => {
    setState((s) => ({ ...s, global: { ...s.global, [field]: values } }));
  }, []);

  /** Clicking the same KPI / chart element again clears the selection. */
  const toggleSelection = useCallback((selection: Selection) => {
    setState((s) => ({ ...s, selection: s.selection?.source === selection.source ? null : selection }));
  }, []);

  const clearSelection = useCallback(() => setState((s) => ({ ...s, selection: null })), []);

  /** Move the register-only selection into the global filters. */
  const promoteSelection = useCallback(() => {
    setState((s) => {
      if (!s.selection) return s;
      return { ...s, global: { ...s.global, ...s.selection.criteria }, selection: null };
    });
  }, []);

  const setCountingRule = useCallback((countingRule: CountingRule) => setState((s) => ({ ...s, countingRule })), []);
  const setSearch = useCallback((search: string) => setState((s) => ({ ...s, search })), []);
  const setSearchScope = useCallback((searchScope: SearchScope) => setState((s) => ({ ...s, searchScope })), []);

  const clearAll = useCallback(() => setState((s) => ({ ...INITIAL, countingRule: s.countingRule })), []);
  const reset = useCallback(() => setState(INITIAL), []);

  const hasActiveFilters = useMemo(
    () => !isCriteriaEmpty(state.global) || state.selection !== null || state.search.trim() !== '',
    [state.global, state.selection, state.search],
  );

  return { state, setGlobalField, toggleSelection, clearSelection, promoteSelection, setCountingRule, setSearch, setSearchScope, clearAll, reset, hasActiveFilters };
}

export type FiltersApi = ReturnType<typeof useFilters>;
