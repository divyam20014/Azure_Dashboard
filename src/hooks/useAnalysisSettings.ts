import { useCallback, useState } from 'react';
import type { LogicalField } from '@/types/mappings';
import { DEFAULT_QUALITY_WEIGHTS, type QualityWeights } from '@/lib/analytics/dataQualityScore';
import { DEFAULT_AGING_THRESHOLDS } from '@/lib/analytics/riskAnalytics';
import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from '@/lib/reports/reportTemplates';

/**
 * User-adjustable analysis settings. Held in React state only (never browser storage)
 * and reset together with the dataset.
 */
export interface AnalysisSettings {
  /** Upper bounds (days) of the aging buckets, e.g. [7, 14, 30]. */
  agingThresholds: number[];
  qualityWeights: QualityWeights;
  /** Fields the user declared required: absent ones then score 0 instead of "not applicable". */
  requiredFields: LogicalField[];
  /** Optional: flag assignees holding more than this share (%) of the open backlog. */
  concentrationThreshold: number | null;
  report: ReportOptions;
}

export const INITIAL_SETTINGS: AnalysisSettings = {
  agingThresholds: DEFAULT_AGING_THRESHOLDS,
  qualityWeights: DEFAULT_QUALITY_WEIGHTS,
  requiredFields: [],
  concentrationThreshold: null,
  report: DEFAULT_REPORT_OPTIONS,
};

export function useAnalysisSettings() {
  const [settings, setSettings] = useState<AnalysisSettings>(INITIAL_SETTINGS);
  const update = useCallback((patch: Partial<AnalysisSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const updateReport = useCallback((patch: Partial<ReportOptions>) => setSettings((s) => ({ ...s, report: { ...s.report, ...patch } })), []);
  const reset = useCallback(() => setSettings(INITIAL_SETTINGS), []);
  return { settings, update, updateReport, reset };
}

export type SettingsApi = ReturnType<typeof useAnalysisSettings>;
