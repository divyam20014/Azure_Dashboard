import { useCallback, useMemo, useState } from 'react';
import type { IssueRecord } from '@/types/issue';
import type { Criteria, Dataset } from '@/types/analytics';
import { useAnalytics } from '@/hooks/useAnalytics';
import type { FiltersApi } from '@/hooks/useFilters';
import { DashboardContext, type DashboardContextValue } from '@/components/dashboard/DashboardContext';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { ExecutiveSummary } from '@/components/dashboard/ExecutiveSummary';
import { StatusAnalytics } from '@/components/dashboard/StatusAnalytics';
import { PriorityAnalytics } from '@/components/dashboard/PriorityAnalytics';
import { AssigneeAnalytics } from '@/components/dashboard/AssigneeAnalytics';
import { HandoffAnalytics } from '@/components/dashboard/HandoffAnalytics';
import { DataQualityOverview } from '@/components/dashboard/DataQualityOverview';
import { IssueFilters } from '@/components/issues/IssueFilters';
import { IssueTable } from '@/components/issues/IssueTable';
import { IssueDetailsDrawer } from '@/components/issues/IssueDetailsDrawer';
import { ExportMenu } from '@/components/export/ExportMenu';
import { PrintReport } from '@/components/export/PrintReport';
import { Notice } from '@/components/common/Common';
import { DashboardHeader } from './DashboardHeader';
import { LazyMount } from './LazyMount';
import { ScrubOnUnmount } from '@/components/common/ScrubOnUnmount';

interface Props {
  dataset: Dataset;
  filters: FiltersApi;
  onReplace: () => void;
  onEditMappings: () => void;
  onClear: () => void;
}

export function DashboardLayout({ dataset, filters, onReplace, onEditMappings, onClear }: Props) {
  const analytics = useAnalytics(dataset, filters.state);
  const [record, setRecord] = useState<IssueRecord | null>(null);
  const [printing, setPrinting] = useState(false);
  const { toggleSelection, state } = filters;

  const select = useCallback(
    (source: string, label: string, criteria: Criteria) => {
      toggleSelection({ source, label, criteria });
    },
    [toggleSelection],
  );
  const isSelected = useCallback((source: string) => state.selection?.source === source, [state.selection]);

  const ctx = useMemo<DashboardContextValue>(
    () => ({ dataset, analytics, filters, select, isSelected, openRecord: setRecord }),
    [dataset, analytics, filters, select, isSelected],
  );

  const datasetLabel = dataset.projectName ?? (dataset.config.columnMapping.project !== null ? 'Multiple projects' : 'Uploaded Dataset');
  const q = dataset.quality;

  return (
    <DashboardContext.Provider value={ctx}>
      <ScrubOnUnmount className={printing ? 'no-print' : undefined}>
        <DashboardHeader
          fileName={dataset.file.fileName}
          sheetName={dataset.file.kind !== 'csv' ? dataset.file.sheetName : undefined}
          recordCount={dataset.records.length}
          datasetLabel={datasetLabel}
          onReplace={onReplace}
          onEditMappings={onEditMappings}
          onClear={onClear}
          exportSlot={<ExportMenu onPrintReport={() => setPrinting(true)} />}
          showNav
        />
        <main className="mx-auto max-w-[1500px] space-y-8 px-4 py-5">
          <div id="overview" className="scroll-mt-32 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-title">{datasetLabel}</h2>
              <p className="text-xs text-muted-foreground">Click a card or chart element to list the matching issues in the register.</p>
            </div>
            {q.duplicateIdRecords > 0 && filters.state.countingRule === 'all' && (
              <Notice tone="warning">
                {q.duplicateIdRecords.toLocaleString()} records share an issue ID with another record ({q.duplicateIdValues.toLocaleString()} distinct IDs). They are all counted.
                Switch the counting rule to “Exclude duplicate IDs” to count each ID once.
              </Notice>
            )}
            <IssueFilters />
            <KpiCards />
          </div>
          <ExecutiveSummary />
          <StatusAnalytics />
          <PriorityAnalytics />
          <LazyMount>
            <AssigneeAnalytics />
          </LazyMount>
          <LazyMount>
            <HandoffAnalytics />
          </LazyMount>
          <IssueTable />
          <LazyMount>
            <DataQualityOverview />
          </LazyMount>
          <footer className="border-t pt-4 text-center text-xs text-muted-foreground">
            All processing happens in this browser tab. No data is uploaded, stored or sent anywhere.
          </footer>
        </main>
      </ScrubOnUnmount>
      <IssueDetailsDrawer dataset={dataset} record={record} onClose={() => setRecord(null)} />
      {printing && <PrintReport onClose={() => setPrinting(false)} />}
    </DashboardContext.Provider>
  );
}
