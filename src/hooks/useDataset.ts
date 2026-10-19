import { useCallback, useEffect, useRef, useState } from 'react';
import type { CsvDelimiter, ParsedFile } from '@/types/issue';
import type { SetupConfig } from '@/types/mappings';
import type { Dataset } from '@/types/analytics';
import { buildDataset, initialSetup } from '@/lib/normalization/datasetBuilder';
import { ImportError, toImportError } from '@/lib/parsers/importErrors';
import { validateFileMeta } from '@/lib/parsers/fileSniffer';
import { installUnloadGuard, resetFileInputs } from '@/lib/privacy/sessionCleanup';
import { releaseChartTextCache } from '@/lib/privacy/chartCacheCleanup';
import { useFileImport } from './useFileImport';

export type Phase = 'upload' | 'setup' | 'dashboard';

/** A parsed file awaiting confirmation. The active dataset (if any) is untouched until confirmed. */
export interface Draft {
  file: File;
  parsed: ParsedFile;
  config: SetupConfig;
  /** True when editing mappings of the active dataset rather than importing a new file. */
  isEdit: boolean;
}

export interface ImportFailure {
  error: ImportError;
  /** True when an existing analysis was preserved because the replacement failed. */
  keptExisting: boolean;
}

interface State {
  phase: Phase;
  dataset: Dataset | null;
  activeFile: File | null;
  draft: Draft | null;
  failure: ImportFailure | null;
  building: boolean;
}

const INITIAL: State = { phase: 'upload', dataset: null, activeFile: null, draft: null, failure: null, building: false };

/** Yield to the browser so a progress state can paint before heavy synchronous work. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function useDataset(options: { onDatasetChanged?: () => void } = {}) {
  const importer = useFileImport();
  const [state, setState] = useState<State>(INITIAL);
  const { onDatasetChanged } = options;

  // Callbacks read the draft through this ref instead of closing over `state`. A memoized
  // callback keeps its render's closure scope alive; if that scope held `state`, the dataset
  // would stay reachable after Clear Data. Only the draft is exposed, and only via the ref.
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = state.draft;

  const hasActiveData = state.dataset !== null || state.draft !== null;
  useEffect(() => (hasActiveData ? installUnloadGuard() : undefined), [hasActiveData]);

  const fail = useCallback((err: unknown) => {
    const error = toImportError(err);
    if (error.code === 'cancelled') return;
    setState((s) => ({ ...s, failure: { error, keptExisting: s.dataset !== null } }));
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      setState((s) => ({ ...s, failure: null }));
      try {
        validateFileMeta(file.name, file.size);
        const parsed = await importer.parse(file);
        if (parsed.rows.length === 0 && parsed.sheetNames.length <= 1) {
          throw new ImportError(parsed.kind === 'csv' ? 'no_rows' : 'empty_sheet', `"${file.name}" does not contain any rows to analyse.`);
        }
        const config = initialSetup(parsed);
        setState((s) => ({ ...s, phase: 'setup', draft: { file, parsed, config, isEdit: false }, failure: null }));
      } catch (err) {
        resetFileInputs();
        fail(err);
      }
    },
    [importer, fail],
  );

  /** Re-parse the draft file with a different worksheet or delimiter. */
  const reparseDraft = useCallback(
    async (opts: { sheetName?: string; delimiter?: CsvDelimiter }) => {
      const draft = draftRef.current;
      if (!draft) return;
      setState((s) => ({ ...s, failure: null }));
      try {
        const parsed = await importer.parse(draft.file, {
          sheetName: opts.sheetName ?? draft.parsed.sheetName,
          delimiter: opts.delimiter ?? draft.parsed.delimiter,
        });
        const config = initialSetup(parsed, draft.config.dateOrder);
        setState((s) => (s.draft ? { ...s, draft: { ...s.draft, parsed, config } } : s));
      } catch (err) {
        fail(err);
      }
    },
    [importer, fail],
  );

  const updateDraftConfig = useCallback((config: SetupConfig) => {
    setState((s) => (s.draft ? { ...s, draft: { ...s.draft, config } } : s));
  }, []);

  /** Build the dataset from the draft and make it the active analysis. */
  const confirmDraft = useCallback(async () => {
    const draft = draftRef.current;
    if (!draft) return;
    setState((s) => ({ ...s, building: true, failure: null }));
    await nextFrame();
    try {
      const dataset = buildDataset(draft.parsed, draft.config);
      setState((s) => ({ ...s, phase: 'dashboard', dataset, activeFile: draft.file, draft: null, building: false, failure: null }));
      onDatasetChanged?.();
    } catch (err) {
      setState((s) => ({ ...s, building: false }));
      fail(err);
    }
  }, [fail, onDatasetChanged]);

  /** Leave setup without applying it. The previous analysis (if any) stays active. */
  const cancelDraft = useCallback(() => {
    importer.cancel();
    resetFileInputs();
    setState((s) => ({ ...s, draft: null, failure: null, phase: s.dataset ? 'dashboard' : 'upload' }));
  }, [importer]);

  const startReplace = useCallback(() => setState((s) => ({ ...s, phase: 'upload', failure: null })), []);
  const backToDashboard = useCallback(() => {
    importer.cancel();
    resetFileInputs();
    setState((s) => (s.dataset ? { ...s, phase: 'dashboard', failure: null } : s));
  }, [importer]);

  const editMappings = useCallback(() => {
    setState((s) =>
      s.dataset && s.activeFile
        ? { ...s, phase: 'setup', draft: { file: s.activeFile, parsed: s.dataset.file, config: s.dataset.config, isEdit: true }, failure: null }
        : s,
    );
  }, []);

  const cancelParse = useCallback(() => {
    importer.cancel();
    resetFileInputs();
  }, [importer]);

  /** Clear Data / Start New Analysis: drop every reference to the uploaded data. */
  const clearAll = useCallback(() => {
    importer.cancel(); // terminates the worker and its cached workbook
    resetFileInputs();
    setState(INITIAL);
    // After the charts have unmounted, evict the chart library's cache of drawn label text.
    setTimeout(releaseChartTextCache, 0);
    onDatasetChanged?.();
  }, [importer, onDatasetChanged]);

  const dismissFailure = useCallback(() => setState((s) => ({ ...s, failure: null })), []);

  return {
    ...state,
    parsing: importer.busy,
    progress: importer.progress,
    openFile,
    reparseDraft,
    updateDraftConfig,
    confirmDraft,
    cancelDraft,
    startReplace,
    backToDashboard,
    editMappings,
    cancelParse,
    clearAll,
    dismissFailure,
  };
}

export type DatasetController = ReturnType<typeof useDataset>;
