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
 * Share of the child's budget the extraction may spend before the optional
 * classification pass is skipped. Measured at roughly half the extraction's cost, so
 * this leaves room for it without letting the added pass push an otherwise valid
 * document past the timeout.
 */
const CLASSIFY_BUDGET_SHARE = 0.5;

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
    let result;
    if (request.op === 'text') {
      result = { text: native.extractText(data) };
    } else {
      const startedAt = Date.now();
      const extraction = native.extractPagesMarkdown(data);
      /* Classification is a second, cheaper pass in this same child. Its per-page
       * reasons are the only place a scan is named: the extraction's own needsOcr flag
       * reports unreliable text, which is a different question and one that fires on
       * dot leaders.
       *
       * It is also optional. The extraction is what the upload needs; this only tells
       * the caller whether to consult OCR as well. When the first pass has already spent
       * the budget, the document that would otherwise time out ships without the hint
       * rather than failing outright. */
      let scannedPages = [];
      if (Date.now() - startedAt < request.classifyBudgetMs) {
        try {
          const detection = native.detectPdf(data);
          scannedPages = (detection.ocrReasonsByPage || [])
            .filter((entry) => (entry.reasons || []).some((r) => request.scanReasons.includes(r)))
            .map((entry) => entry.page);
        } catch (classifyError) {
          /* Optional means optional: a classifier that cannot read this document must not
           * discard the extraction that already succeeded, which the parent would answer
           * by falling back to a weaker engine or refusing the upload outright. */
        }
      }
      result = { pages: extraction.pages, scannedPages };
    }
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
        ? __serializedBytes(result.text || '')
        : result.pages.reduce(
            (total, page) =>
              total + __serializedBytes(page.markdown || '') + request.pageOverheadBytes,
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
  /** 1-indexed pages the classifier attributes to a scan. */
  scannedPages?: number[];
  text?: string;
}

export interface PdfPageExtraction {
  pages: PageMarkdownResult[];
  scannedPages: number[];
}

/**
 * Classification reasons that mean "a scan holds content here".
 *
 * An allowlist, not a denylist: the engine also flags pages for text-quality reasons
 * such as `suspected_garbled_text`, which false-positives on dot leaders and dense
 * punctuation. Escalating those would replace a correct extraction with an OCR guess
 * on any document that has a table of contents.
 */
export const SCAN_OCR_REASONS = ['scanned'] as const;

type PdfChildOp = 'pages' | 'text';

function runPdfChild(
  op: PdfChildOp,
  filePath: string,
  signal?: AbortSignal,
): Promise<PdfChildResult> {
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
      scanReasons: SCAN_OCR_REASONS,
      classifyBudgetMs: PDF_CHILD_TIMEOUT_MS * CLASSIFY_BUDGET_SHARE,
    },
    timeoutMs: PDF_CHILD_TIMEOUT_MS,
    signal,
  });
}

/** Per-page markdown for a PDF, parsed outside the API process. */
export async function extractPagesMarkdownIsolated(
  filePath: string,
  signal?: AbortSignal,
): Promise<PdfPageExtraction> {
  const { pages, scannedPages } = await runPdfChild('pages', filePath, signal);
  return { pages: pages ?? [], scannedPages: scannedPages ?? [] };
}

/**
 * Whole-document plain text for a PDF, parsed outside the API process.
 *
 * Unlike the per-page markdown extractor, this one re-segments words from glyph
 * positions, which is what makes it readable on documents with a poor OCR layer.
 */
export async function extractTextIsolated(filePath: string, signal?: AbortSignal): Promise<string> {
  const { text } = await runPdfChild('text', filePath, signal);
  return text ?? '';
}
