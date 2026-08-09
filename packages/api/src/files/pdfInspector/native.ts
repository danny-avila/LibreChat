import type { PageMarkdownResult } from '@firecrawl/pdf-inspector';
import {
  MAX_PARSER_OUTPUT_BYTES,
  MAX_PARSER_PAGES,
  PARSER_PAGE_OVERHEAD_BYTES,
  runNativeParserChild,
} from '../documents/nativeProcess';

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
    /* Bounded here so no oversized extraction crosses IPC into the API process. The
     * page count is its own limit: pages that converted to nothing weigh nothing, so
     * byte accounting alone would wave through an arbitrarily long array of them. */
    if (request.op !== 'text' && result.pages.length > request.maxPages) {
      process.send({
        ok: false,
        code: 'PARSER_OUTPUT_LIMIT',
        message:
          'returned ' +
          result.pages.length +
          ' pages, over the ' +
          request.maxPages +
          '-page limit',
      });
      return;
    }
    const bytes =
      request.op === 'text'
        ? Buffer.byteLength(result.text || '', 'utf8')
        : result.pages.reduce(
            (total, page) =>
              total + Buffer.byteLength(page.markdown || '', 'utf8') + request.pageOverheadBytes,
            0,
          );
    if (bytes > request.maxOutputBytes) {
      process.send({
        ok: false,
        code: 'PARSER_OUTPUT_LIMIT',
        message:
          'extracted ' +
          Math.round(bytes / (1024 * 1024)) +
          'MB of text, over the ' +
          Math.round(request.maxOutputBytes / (1024 * 1024)) +
          'MB limit',
      });
      return;
    }
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
  return runNativeParserChild<PdfChildResult>({
    childSource: CHILD_SOURCE,
    parserName: `pdf-inspector ${op}`,
    request: {
      op,
      path: filePath,
      modulePath,
      maxOutputBytes: MAX_PARSER_OUTPUT_BYTES,
      maxPages: MAX_PARSER_PAGES,
      pageOverheadBytes: PARSER_PAGE_OVERHEAD_BYTES,
    },
    timeoutMs: PDF_CHILD_TIMEOUT_MS,
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
