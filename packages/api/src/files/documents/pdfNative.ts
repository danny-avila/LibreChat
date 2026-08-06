import { Worker } from 'worker_threads';
import type { PageMarkdownResult } from '@firecrawl/pdf-inspector';

/**
 * Runs pdf-inspector's native bindings on a worker thread.
 *
 * The bindings expose no async variant: every export is a synchronous napi call,
 * so invoking them inline blocks the event loop for the whole parse and stalls
 * every other request on the process. They also parse attacker-supplied bytes in
 * Rust, where a panic, abort, or stack overflow on a hostile object graph is not
 * something a JS `try`/`catch` can recover from, so an in-process crash would take
 * down the server and every in-flight stream with it.
 *
 * A worker per document turns both into a contained, recoverable failure: the loop
 * stays responsive while the parse runs, and a thread that dies takes only its own
 * request with it. Callers surface a rejection and fall back to pdfjs, so a
 * document that dies here still parses.
 */

/** Bounds a parse that never returns; the main thread is free to fire this timer. */
const PDF_WORKER_TIMEOUT_MS = 30_000;

/**
 * Worker body, kept as a string so the bundler emits no second entry point and the
 * path resolution stays valid under Jest, tsdown's CJS bundle, and a published
 * tarball alike. The native module is resolved on the main thread and passed in,
 * so the worker never depends on its own working directory.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('worker_threads');
const fs = require('fs');
try {
  const native = require(workerData.modulePath);
  const data = fs.readFileSync(workerData.path);
  const result =
    workerData.op === 'text'
      ? { text: native.extractText(data) }
      : { pages: native.extractPagesMarkdown(data).pages };
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, message: error && error.message ? error.message : String(error) });
}
`;

interface PdfWorkerResult {
  pages?: PageMarkdownResult[];
  text?: string;
}

type PdfWorkerOp = 'pages' | 'text';

function runPdfWorker(op: PdfWorkerOp, filePath: string): Promise<PdfWorkerResult> {
  const modulePath = require.resolve('@firecrawl/pdf-inspector');

  return new Promise<PdfWorkerResult>((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { op, path: filePath, modulePath },
    });

    let settled = false;
    const finish = (error: Error | null, value?: PdfWorkerResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) {
        reject(error);
        return;
      }
      resolve(value as PdfWorkerResult);
    };

    const timer = setTimeout(
      () => finish(new Error(`pdf-inspector ${op} timed out after ${PDF_WORKER_TIMEOUT_MS}ms`)),
      PDF_WORKER_TIMEOUT_MS,
    );
    /* The parse holds the thread; without this the timer alone would keep an idle
     * process alive for the full timeout. */
    timer.unref?.();

    worker.on('message', (message: { ok: boolean; result?: PdfWorkerResult; message?: string }) => {
      if (message.ok) {
        finish(null, message.result);
        return;
      }
      finish(new Error(message.message ?? `pdf-inspector ${op} failed`));
    });
    worker.on('error', (error: Error) => finish(error));
    /* Reached when the native binding aborts the thread outright, which is exactly
     * the case an in-process call could not have survived. */
    worker.on('exit', (code: number) =>
      finish(new Error(`pdf-inspector ${op} worker exited with code ${code}`)),
    );
  });
}

/** Per-page markdown for a PDF, parsed off the event loop. */
export async function extractPagesMarkdownIsolated(
  filePath: string,
): Promise<PageMarkdownResult[]> {
  const { pages } = await runPdfWorker('pages', filePath);
  return pages ?? [];
}

/**
 * Whole-document plain text for a PDF, parsed off the event loop.
 *
 * Unlike the per-page markdown extractor, this one re-segments words from glyph
 * positions, which is what makes it readable on documents with a poor OCR layer.
 */
export async function extractTextIsolated(filePath: string): Promise<string> {
  const { text } = await runPdfWorker('text', filePath);
  return text ?? '';
}
