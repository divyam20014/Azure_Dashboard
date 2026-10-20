import { createContext, useContext } from 'react';
import type { IssueRecord } from '@/types/issue';
import type { Criteria, Dataset } from '@/types/analytics';
import type { Analytics } from '@/hooks/useAnalytics';
import type { FiltersApi } from '@/hooks/useFilters';
import type { SettingsApi } from '@/hooks/useAnalysisSettings';
import type { ComparisonSnapshot } from '@/hooks/useDataset';
import type { ImportError } from '@/lib/parsers/importErrors';

export interface ComparisonApi {
  snapshot: ComparisonSnapshot | null;
  loading: boolean;
  error: ImportError | null;
  load: (file: File) => void;
  clear: () => void;
}

export interface DashboardContextValue {
  dataset: Dataset;
  analytics: Analytics;
  filters: FiltersApi;
  settings: SettingsApi;
  comparison: ComparisonApi;
  /** Toggle a chart / KPI selection that narrows the issue register. */
  select: (source: string, label: string, criteria: Criteria) => void;
  /** Toggle a selection of an exact record set (risk cards, aging buckets…). */
  selectRecords: (source: string, label: string, indexes: Iterable<number>) => void;
  isSelected: (source: string) => boolean;
  openRecord: (record: IssueRecord) => void;
  /** Open the report preview for the current report options. */
  openReportPreview: () => void;
  scrollToRegister: () => void;
}

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside the dashboard');
  return ctx;
}
