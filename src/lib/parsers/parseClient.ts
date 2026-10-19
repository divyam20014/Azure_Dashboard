import type { ParsedFile } from '@/types/issue';
import { ImportSession, type ParseOptions, type ProgressCallback } from './importSession';
import { ImportError, fromPayload, toImportError } from './importErrors';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

/** Front door for parsing: uses a Web Worker when available, otherwise parses on the main thread. */
export interface ParseClient {
  parse(file: File, options: ParseOptions, onProgress?: ProgressCallback): Promise<ParsedFile>;
  /** Abort any running parse and release all cached file contents. */
  terminate(): void;
}

class LocalParseClient implements ParseClient {
  private session = new ImportSession();
  private generation = 0;

  async parse(file: File, options: ParseOptions, onProgress?: ProgressCallback): Promise<ParsedFile> {
    const gen = ++this.generation;
    try {
      const parsed = await this.session.parse(file, options, onProgress);
      if (gen !== this.generation) throw new ImportError('cancelled', 'The import was cancelled.');
      return parsed;
    } catch (err) {
      throw toImportError(err);
    }
  }

  terminate(): void {
    this.generation++;
    this.session.dispose();
  }
}

interface Pending {
  resolve: (parsed: ParsedFile) => void;
  reject: (err: ImportError) => void;
  onProgress?: ProgressCallback;
}

class WorkerParseClient implements ParseClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../../workers/parsingWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      if (msg.type === 'progress') {
        entry.onProgress?.(msg.progress);
      } else if (msg.type === 'result') {
        this.pending.delete(msg.id);
        entry.resolve(msg.parsed);
      } else {
        this.pending.delete(msg.id);
        entry.reject(fromPayload(msg.error));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      // A crashed worker most often means the browser ran out of memory.
      this.failAll(
        new ImportError(
          'out_of_memory',
          'The file could not be processed — the browser may have run out of memory. Try a smaller file, close other tabs, or save the sheet as CSV.',
        ),
      );
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }

  private failAll(error: ImportError): void {
    for (const entry of this.pending.values()) entry.reject(error);
    this.pending.clear();
  }

  parse(file: File, options: ParseOptions, onProgress?: ProgressCallback): Promise<ParsedFile> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<ParsedFile>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      const request: WorkerRequest = { type: 'parse', id, file, options };
      worker.postMessage(request);
    });
  }

  terminate(): void {
    this.failAll(new ImportError('cancelled', 'The import was cancelled.'));
    this.worker?.terminate();
    this.worker = null;
  }
}

export function createParseClient(): ParseClient {
  if (typeof Worker === 'undefined') return new LocalParseClient();
  return new WorkerParseClient();
}
