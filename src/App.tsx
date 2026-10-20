import { useCallback, useMemo, useState } from 'react';
import { useDataset } from '@/hooks/useDataset';
import { useFilters } from '@/hooks/useFilters';
import { useAnalysisSettings } from '@/hooks/useAnalysisSettings';
import { DashboardHeader } from '@/components/layout/DashboardHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { FileUpload } from '@/components/upload/FileUpload';
import { SetupWizard } from '@/components/upload/SetupWizard';
import { ConfirmationDialog } from '@/components/common/ConfirmationDialog';
import { ThemeProvider } from '@/components/common/ThemeContext';
import { ToastProvider, useToast } from '@/components/common/Toast';

function AppShell() {
  const filters = useFilters();
  const settings = useAnalysisSettings();
  const notify = useToast();
  const { reset: resetFilters } = filters;
  const { reset: resetSettings } = settings;
  // A new or re-mapped dataset, and Clear Data, reset every filter, selection and setting.
  const onDatasetChanged = useCallback(() => {
    resetFilters();
    resetSettings();
  }, [resetFilters, resetSettings]);
  const controller = useDataset({ onDatasetChanged });
  const { comparison: snapshot, comparisonLoading, comparisonError, loadComparison, clearComparison } = controller;
  const comparison = useMemo(
    () => ({ snapshot, loading: comparisonLoading, error: comparisonError, load: loadComparison, clear: clearComparison }),
    [snapshot, comparisonLoading, comparisonError, loadComparison, clearComparison],
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const { phase, dataset, draft } = controller;
  const hasAnalysis = dataset !== null || draft !== null;

  const requestClear = () => (hasAnalysis ? setConfirmClear(true) : controller.clearAll());
  const clear = () => {
    controller.clearAll();
    notify('Data cleared. The uploaded file and all results have been released from this page.');
  };

  return (
    <div className="min-h-screen">
      {phase === 'dashboard' && dataset ? (
        <DashboardLayout
          dataset={dataset}
          filters={filters}
          settings={settings}
          comparison={comparison}
          onReplace={controller.startReplace}
          onEditMappings={controller.editMappings}
          onClear={requestClear}
        />
      ) : (
        <>
          <DashboardHeader
            fileName={draft?.parsed.fileName ?? dataset?.file.fileName}
            recordCount={dataset && !draft ? dataset.records.length : undefined}
            onClear={hasAnalysis ? requestClear : undefined}
          />
          <main>
            {phase === 'setup' && draft ? (
              <SetupWizard controller={controller} />
            ) : (
              <FileUpload
                onFile={controller.openFile}
                parsing={controller.parsing}
                progress={controller.progress}
                onCancelParse={controller.cancelParse}
                failure={controller.failure}
                onDismissFailure={controller.dismissFailure}
                onBack={dataset ? controller.backToDashboard : undefined}
                currentFileName={dataset?.file.fileName}
              />
            )}
          </main>
        </>
      )}
      <ConfirmationDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear data and start a new analysis?"
        description={
          <div className="space-y-2">
            <p>This removes the uploaded file, any comparison snapshot, all parsed records, mappings, charts, filters, selections, report settings and previews from this page.</p>
            <p>Nothing is stored anywhere else, so the analysis cannot be recovered afterwards. Export anything you need first.</p>
          </div>
        }
        confirmLabel="Clear Data"
        destructive
        onConfirm={clear}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </ThemeProvider>
  );
}
