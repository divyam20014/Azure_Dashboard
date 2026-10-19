function readNumberEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Maximum accepted upload size. Override at build time with VITE_MAX_FILE_SIZE_MB. */
export const MAX_FILE_SIZE_MB = readNumberEnv(import.meta.env?.VITE_MAX_FILE_SIZE_MB, 100);
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'] as const;

/** Rows offered when choosing the header row. */
export const HEADER_SCAN_ROWS = 30;

/** Rows shown in the pre-analysis preview. */
export const PREVIEW_ROWS = 15;
