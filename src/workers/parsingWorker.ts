/// <reference lib="webworker" />
/**
 * Parsing worker. Receives a File from the page (structured clone, same browser
 * process), parses it in memory and posts the rows back. It performs no network
 * access and writes nothing to storage. Terminating the worker releases its cache.
 */
import { ImportSession } from '@/lib/parsers/importSession';
import { toImportError } from '@/lib/parsers/importErrors';
import type { WorkerRequest, WorkerResponse } from '@/lib/parsers/workerProtocol';

const session = new ImportSession();
const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerResponse): void {
  ctx.postMessage(message);
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'dispose') {
    session.dispose();
    return;
  }
  try {
    const parsed = await session.parse(request.file, request.options, (progress) => post({ type: 'progress', id: request.id, progress }));
    post({ type: 'result', id: request.id, parsed });
  } catch (err) {
    const error = toImportError(err);
    post({ type: 'error', id: request.id, error: { code: error.code, message: error.message } });
  }
};
