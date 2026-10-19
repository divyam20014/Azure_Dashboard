import { useCallback, useEffect, useRef, useState } from 'react';
import type { ParsedFile } from '@/types/issue';
import { createParseClient, type ParseClient } from '@/lib/parsers/parseClient';
import type { ParseOptions, ParseProgress } from '@/lib/parsers/importSession';

/** Owns the parsing worker. `cancel()` terminates it, which also frees any cached workbook. */
export function useFileImport() {
  const clientRef = useRef<ParseClient | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ParseProgress | null>(null);

  const parse = useCallback(async (file: File, options: ParseOptions = {}): Promise<ParsedFile> => {
    clientRef.current ??= createParseClient();
    setBusy(true);
    setProgress({ stage: 'reading' });
    try {
      return await clientRef.current.parse(file, options, setProgress);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, []);

  const cancel = useCallback(() => {
    clientRef.current?.terminate();
    clientRef.current = null;
    setBusy(false);
    setProgress(null);
  }, []);

  useEffect(() => () => clientRef.current?.terminate(), []);

  return { parse, cancel, busy, progress };
}
