import type { ParsedFile } from '@/types/issue';
import type { ImportErrorPayload } from './importErrors';
import type { ParseOptions, ParseProgress } from './importSession';

export type WorkerRequest =
  | { type: 'parse'; id: number; file: File; options: ParseOptions }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'progress'; id: number; progress: ParseProgress }
  | { type: 'result'; id: number; parsed: ParsedFile }
  | { type: 'error'; id: number; error: ImportErrorPayload };
