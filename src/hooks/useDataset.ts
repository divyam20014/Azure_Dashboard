import { useCallback, useEffect, useRef, useState } from 'react';
import type { CsvDelimiter, ParsedFile } from '@/types/issue';
import type { SetupConfig } from '@/types/mappings';
import type { Dataset } from '@/types/analytics';
import { buildDataset, comparisonSetup, initialSetup } from '@/lib/normalization/datasetBuilder';
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

/** An earlier export loaded for comparison, normalized with the active dataset's mappings. */
export interface ComparisonSnapshot {
  dataset: Dataset;
  fileName: string;
  /** Mapped fields of the active dataset that could not be found in the snapshot. */
  missingFields: string[];
}

interface State {
  phase: Phase;
  dataset: Dataset | null;
  activeFile: File | null;
  draft: Draft | null;
  failure: ImportFailure | null;
  building: boolean;
  comparison: ComparisonSnapshot | null;
  comparisonLoading: boolean;
  comparisonError: ImportError | null;
}

const INITIAL: State = {
  phase: 'upload',
  dataset: null,
  activeFile: null,
  draft: null,
  failure: null,
  building: false,
  comparison: null,
  comparisonLoading: false,
  comparisonError: null,
};

function buildComparison(parsed: ParsedFile, reference: Dataset): ComparisonSnapshot {
  const config = comparisonSetup(parsed, reference);
  const dataset = buildDataset(parsed, config);
  const missingFields = (Object.keys(reference.config.columnMapping) as (keyof SetupConfig['columnMapping'])[])
    .filter((f) => reference.config.columnMapping[f] !== null && config.columnMapping[f] === null)
    .map((f) => reference.headers[reference.config.columnMapping[f]!]);
  return { dataset, fileName: parsed.fileName, missingFields };
}

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
  const datasetRef = useRef<Dataset | null>(null);
  datasetRef.current = state.dataset;

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
      setState((s) => {
        // A new file discards the comparison snapshot; edited mappings re-normalize it with the new rules.
        let comparison: ComparisonSnapshot | null = null;
        if (draft.isEdit && s.comparison) {
          try {
            comparison = buildComparison(s.comparison.dataset.file, dataset);
          } catch {
            comparison = null;
          }
        }
        return { ...s, phase: 'dashboard', dataset, activeFile: draft.file, draft: null, building: false, failure: null, comparison, comparisonError: null };
      });
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

  /** Load an earlier export as the comparison snapshot (kept in memory only). */
  const loadComparison = useCallback(
    async (file: File) => {
      const reference = datasetRef.current;
      if (!reference) return;
      setState((s) => ({ ...s, comparisonLoading: true, comparisonError: null }));
      try {
        validateFileMeta(file.name, file.size);
        let parsed = await importer.parse(file);
        const sameSheet = reference.file.sheetName;
        if (parsed.kind !== 'csv' && parsed.sheetName !== sameSheet && parsed.sheetNames.includes(sameSheet)) {
          parsed = await importer.parse(file, { sheetName: sameSheet });
        } else if (parsed.kind !== 'csv' && parsed.sheetNames.length > 1 && !parsed.sheetNames.includes(sameSheet)) {
          // No sheet with the same name: use the worksheet whose columns best match the current mapping.
          const matched = (p: ParsedFile) => {
            const mapping = comparisonSetup(p, reference).columnMapping;
            return (Object.keys(mapping) as (keyof typeof mapping)[]).filter((f) => mapping[f] !== null && reference.config.columnMapping[f] !== null).length;
          };
          let best = parsed;
          let bestScore = parsed.rows.length ? matched(parsed) : -1;
          for (const name of parsed.sheetNames) {
            if (name === parsed.sheetName) continue;
            const candidate = await importer.parse(file, { sheetName: name });
            const score = candidate.rows.length ? matched(candidate) : -1;
            if (score > bestScore) {
              best = candidate;
              bestScore = score;
            }
          }
          parsed = best;
        }
        if (parsed.rows.length === 0) throw new ImportError('no_rows', `"${file.name}" does not contain any rows to compare.`);
        const snapshot = buildComparison(parsed, reference);
        if (snapshot.dataset.config.columnMapping.id === null) {
          throw new ImportError('processing_failed', `"${file.name}" has no issue ID column matching the current file, so records cannot be matched between snapshots.`);
        }
        setState((s) => (s.dataset === reference ? { ...s, comparison: snapshot, comparisonLoading: false } : { ...s, comparisonLoading: false }));
      } catch (err) {
        const error = toImportError(err);
        setState((s) => ({ ...s, comparisonLoading: false, comparisonError: error.code === 'cancelled' ? null : error }));
      } finally {
        resetFileInputs();
      }
    },
    [importer],
  );

  const clearComparison = useCallback(() => {
    setState((s) => ({ ...s, comparison: null, comparisonError: null }));
    setTimeout(releaseChartTextCache, 0);
  }, []);

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
    loadComparison,
    clearComparison,
  };
}

export type DatasetController = ReturnType<typeof useDataset>;
