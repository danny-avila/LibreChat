import { spawn } from 'child_process';
import type { PageMarkdownResult } from '@firecrawl/pdf-inspector';

/**
 * Runs pdf-inspector's native bindings in a child process.
 *
 * The bindings expose no async variant: every export is a synchronous napi call,
 * so invoking them inline blocks the event loop for the whole parse and stalls
 * every other request on the process. A worker thread keeps the event loop free,
 * but it does not isolate native faults because worker threads share the server
 * process, and terminating a worker cannot preempt a synchronous N-API call.
 *
 * A child process per document provides the required fault boundary: an abort or
 * segmentation fault ends only the parser process, and the parent can forcibly
 * kill a synchronous parse that exceeds the timeout. Callers receive a rejection
 * and can fall back to pdfjs without risking the API process.
 */

/** Bounds a parse that never returns; the main thread is free to fire this timer. */
const PDF_CHILD_TIMEOUT_MS = 30_000;

/**
 * Child body, kept as a string so the bundler emits no second entry point and the
 * path resolution stays valid under Jest, tsdown's CJS bundle, and a published
 * tarball alike. The native module is resolved on the main thread and passed in,
 * so the child never depends on its own working directory.
 */
const CHILD_SOURCE = `
process.once('message', (request) => {
  const fs = require('fs');
  try {
    const native = require(request.modulePath);
    const data = fs.readFileSync(request.path);
    const result =
      request.op === 'text'
        ? { text: native.extractText(data) }
        : { pages: native.extractPagesMarkdown(data).pages };
    process.send({ ok: true, result });
  } catch (error) {
    process.send({ ok: false, message: error && error.message ? error.message : String(error) });
  }
});
`;

interface PdfChildResult {
  pages?: PageMarkdownResult[];
  text?: string;
}

type PdfChildOp = 'pages' | 'text';

function runPdfChild(op: PdfChildOp, filePath: string): Promise<PdfChildResult> {
  const modulePath = require.resolve('@firecrawl/pdf-inspector');

  return new Promise<PdfChildResult>((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', CHILD_SOURCE], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    let settled = false;
    const finish = (error: Error | null, value?: PdfChildResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (!child.killed) {
        child.kill('SIGKILL');
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(value as PdfChildResult);
    };

    const timer = setTimeout(
      () => finish(new Error(`pdf-inspector ${op} timed out after ${PDF_CHILD_TIMEOUT_MS}ms`)),
      PDF_CHILD_TIMEOUT_MS,
    );
    /* The parse holds the child; without this the timer alone would keep an idle
     * process alive for the full timeout. */
    timer.unref?.();

    child.on('message', (message: { ok: boolean; result?: PdfChildResult; message?: string }) => {
      if (message.ok) {
        finish(null, message.result);
        return;
      }
      finish(new Error(message.message ?? `pdf-inspector ${op} failed`));
    });
    child.on('error', (error: Error) => finish(error));
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) =>
      finish(
        new Error(
          signal
            ? `pdf-inspector ${op} child exited from signal ${signal}`
            : `pdf-inspector ${op} child exited with code ${code}`,
        ),
      ),
    );
    child.send({ op, path: filePath, modulePath }, (error) => {
      if (error) {
        finish(error);
      }
    });
  });
}

/** Per-page markdown for a PDF, parsed outside the API process. */
export async function extractPagesMarkdownIsolated(
  filePath: string,
): Promise<PageMarkdownResult[]> {
  const { pages } = await runPdfChild('pages', filePath);
  return pages ?? [];
}

/**
 * Whole-document plain text for a PDF, parsed outside the API process.
 *
 * Unlike the per-page markdown extractor, this one re-segments words from glyph
 * positions, which is what makes it readable on documents with a poor OCR layer.
 */
export async function extractTextIsolated(filePath: string): Promise<string> {
  const { text } = await runPdfChild('text', filePath);
  return text ?? '';
}
