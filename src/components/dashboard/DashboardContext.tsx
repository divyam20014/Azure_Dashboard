import { createContext, useContext } from 'react';
import type { IssueRecord } from '@/types/issue';
import type { Criteria, Dataset } from '@/types/analytics';
import type { Analytics } from '@/hooks/useAnalytics';
import type { FiltersApi } from '@/hooks/useFilters';

export interface DashboardContextValue {
  dataset: Dataset;
  analytics: Analytics;
  filters: FiltersApi;
  /** Toggle a chart / KPI selection that narrows the issue register. */
  select: (source: string, label: string, criteria: Criteria) => void;
  isSelected: (source: string) => boolean;
  openRecord: (record: IssueRecord) => void;
}

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside the dashboard');
  return ctx;
}
