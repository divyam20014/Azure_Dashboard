import { useCallback, useMemo, useState } from 'react';
import type { IssueRecord } from '@/types/issue';
import type { Criteria, Dataset } from '@/types/analytics';
import { useAnalytics } from '@/hooks/useAnalytics';
import type { FiltersApi } from '@/hooks/useFilters';
import type { SettingsApi } from '@/hooks/useAnalysisSettings';
import { DashboardContext, type ComparisonApi, type DashboardContextValue } from '@/components/dashboard/DashboardContext';
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';
import { ActiveWorkByAssignee } from '@/components/dashboard/ActiveWorkByAssignee';
import { ExecutiveSummary } from '@/components/dashboard/ExecutiveSummary';
import { RiskPanel } from '@/components/dashboard/RiskPanel';
import { StatusAnalytics } from '@/components/dashboard/StatusAnalytics';
import { PriorityAnalytics } from '@/components/dashboard/PriorityAnalytics';
import { AssigneeAnalytics } from '@/components/dashboard/AssigneeAnalytics';
import { HandoffAnalytics } from '@/components/dashboard/HandoffAnalytics';
import { DataQualityOverview } from '@/components/dashboard/DataQualityOverview';
import { ComparisonPanel } from '@/components/dashboard/ComparisonPanel';
import { ChartBuilderSection } from '@/components/builder/ChartBuilderSection';
import { IssueFilters } from '@/components/issues/IssueFilters';
import { IssueTable } from '@/components/issues/IssueTable';
import { IssueDetailsDrawer } from '@/components/issues/IssueDetailsDrawer';
import { ExportMenu } from '@/components/export/ExportMenu';
import { ReportGenerator } from '@/components/export/ReportGenerator';
import { ReportPreview } from '@/components/export/ReportPreview';
import { Notice } from '@/components/common/Common';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';
import { REPORT_TEMPLATES } from '@/lib/reports/reportTemplates';
import { DashboardHeader } from './DashboardHeader';
import { DashboardSidebar, DASHBOARD_SECTIONS } from './DashboardSidebar';
import { LazyMount } from './LazyMount';

interface Props {
  dataset: Dataset;
  filters: FiltersApi;
  settings: SettingsApi;
  comparison: ComparisonApi;
  onReplace: () => void;
  onEditMappings: () => void;
  onClear: () => void;
}

export function DashboardLayout({ dataset, filters, settings, comparison, onReplace, onEditMappings, onClear }: Props) {
  const analytics = useAnalytics(dataset, filters.state, settings.settings, comparison.snapshot?.dataset ?? null);
  const [record, setRecord] = useState<IssueRecord | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { toggleSelection, state } = filters;

  const select = useCallback((source: string, label: string, criteria: Criteria) => toggleSelection({ source, label, criteria }), [toggleSelection]);
  const selectRecords = useCallback(
    (source: string, label: string, indexes: Iterable<number>) => toggleSelection({ source, label, criteria: {}, indexes: new Set(indexes) }),
    [toggleSelection],
  );
  const isSelected = useCallback((source: string) => state.selection?.source === source, [state.selection]);
  const scrollToRegister = useCallback(() => {
    // Wait for the register to re-render with the new selection before scrolling.
    setTimeout(() => document.getElementById('register')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }, []);

  const ctx = useMemo<DashboardContextValue>(
    () => ({
      dataset,
      analytics,
      filters,
      settings,
      comparison,
      select,
      selectRecords,
      isSelected,
      openRecord: setRecord,
      openReportPreview: () => setPreviewing(true),
      scrollToRegister,
    }),
    [dataset, analytics, filters, settings, comparison, select, selectRecords, isSelected, scrollToRegister],
  );

  const datasetLabel = dataset.projectName ?? (dataset.config.columnMapping.project !== null ? 'Multiple projects' : 'Uploaded Dataset');
  const q = dataset.quality;

  return (
    <DashboardContext.Provider value={ctx}>
      <ScrubOnUnmount className={previewing ? 'no-print' : undefined}>
        <DashboardHeader
          fileName={dataset.file.fileName}
          sheetName={dataset.file.kind !== 'csv' ? dataset.file.sheetName : undefined}
          recordCount={dataset.records.length}
          includedCount={analytics.scopes.included}
          activeFilterCount={Object.values(filters.state.global).filter((v) => v && v.length > 0).length + (filters.state.createdFrom || filters.state.createdTo ? 1 : 0)}
          reportTemplate={REPORT_TEMPLATES[settings.settings.report.template].title}
          comparisonFile={comparison.snapshot?.fileName}
          datasetLabel={datasetLabel}
          onReplace={onReplace}
          onEditMappings={onEditMappings}
          onClear={onClear}
          exportSlot={<ExportMenu />}
          showNav
          onToggleSections={() => setMobileNavOpen(true)}
        />
        <div className="mx-auto flex max-w-[1500px] items-start">
          <DashboardSidebar
            sections={DASHBOARD_SECTIONS}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
          />
          <main className="min-w-0 flex-1 space-y-8 px-4 py-5">
            <div className="space-y-3">
              <h2 className="sr-only">Filters</h2>
              {q.duplicateIdRecords > 0 && filters.state.countingRule === 'all' && (
                <Notice tone="warning">
                  {q.duplicateIdRecords.toLocaleString()} records share an issue ID with another record ({q.duplicateIdValues.toLocaleString()} distinct IDs). They are all counted. Choose another duplicate-ID rule in the filter bar to
                  exclude or review them.
                </Notice>
              )}
              <IssueFilters />
            </div>
            <ExecutiveDashboard />
            <ActiveWorkByAssignee />
            <ExecutiveSummary />
            <RiskPanel />
            <StatusAnalytics />
            <PriorityAnalytics />
            <LazyMount>
              <AssigneeAnalytics />
            </LazyMount>
            <ChartBuilderSection />
            <LazyMount>
              <HandoffAnalytics />
            </LazyMount>
            <IssueTable />
            <LazyMount>
              <DataQualityOverview />
            </LazyMount>
            <ComparisonPanel />
            <ReportGenerator />
            <footer className="border-t pt-4 text-center text-xs text-muted-foreground">All processing happens in this browser tab. No data is uploaded, stored or sent anywhere.</footer>
          </main>
        </div>
      </ScrubOnUnmount>
      <IssueDetailsDrawer dataset={dataset} record={record} onClose={() => setRecord(null)} />
      {previewing && <ReportPreview onClose={() => setPreviewing(false)} />}
    </DashboardContext.Provider>
  );
}
