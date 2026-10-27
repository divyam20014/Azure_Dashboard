import { useCallback, useState } from 'react';
import type { LogicalField } from '@/types/mappings';
import { DEFAULT_QUALITY_WEIGHTS, type QualityWeights } from '@/lib/analytics/dataQualityScore';
import { DEFAULT_AGING_THRESHOLDS } from '@/lib/analytics/riskAnalytics';
import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from '@/lib/reports/reportTemplates';
import type { ChartConfig } from '@/lib/charts/chartConfig';

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
  /** Custom Chart Builder charts, in display order (session memory only). */
  charts: ChartConfig[];
}

export const INITIAL_SETTINGS: AnalysisSettings = {
  agingThresholds: DEFAULT_AGING_THRESHOLDS,
  qualityWeights: DEFAULT_QUALITY_WEIGHTS,
  requiredFields: [],
  concentrationThreshold: null,
  report: DEFAULT_REPORT_OPTIONS,
  charts: [],
};

export function useAnalysisSettings() {
  const [settings, setSettings] = useState<AnalysisSettings>(INITIAL_SETTINGS);
  const update = useCallback((patch: Partial<AnalysisSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const updateReport = useCallback((patch: Partial<ReportOptions>) => setSettings((s) => ({ ...s, report: { ...s.report, ...patch } })), []);
  const reset = useCallback(() => setSettings(INITIAL_SETTINGS), []);
  const addChart = useCallback((chart: ChartConfig) => setSettings((s) => ({ ...s, charts: [...s.charts, chart] })), []);
  const updateChart = useCallback((chart: ChartConfig) => setSettings((s) => ({ ...s, charts: s.charts.map((c) => (c.id === chart.id ? chart : c)) })), []);
  const removeChart = useCallback((id: string) => setSettings((s) => ({ ...s, charts: s.charts.filter((c) => c.id !== id) })), []);
  const moveChart = useCallback(
    (id: string, delta: -1 | 1) =>
      setSettings((s) => {
        const i = s.charts.findIndex((c) => c.id === id);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= s.charts.length) return s;
        const charts = [...s.charts];
        [charts[i], charts[j]] = [charts[j], charts[i]];
        return { ...s, charts };
      }),
    [],
  );
  return { settings, update, updateReport, reset, addChart, updateChart, removeChart, moveChart };
}

export type SettingsApi = ReturnType<typeof useAnalysisSettings>;
