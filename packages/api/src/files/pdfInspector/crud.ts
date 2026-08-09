import * as fs from 'fs';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { ParsedDocumentUploadResult } from '~/types';
import {
  extractDocumentTextWithPages,
  extractPageText,
  PdfPageLimitError,
} from '../documents/pdfjs';
import { MAX_PARSER_OUTPUT_BYTES, isParserOutputLimit } from '../documents/nativeProcess';
import { extractPagesMarkdownIsolated, extractTextIsolated } from './native';
import { ConcurrencyLimitError } from '~/utils/promise';

type ParsedDocument = Pick<
  ParsedDocumentUploadResult,
  'text' | 'pagesNeedingOcr' | 'mayEmbedMedia'
>;

/** Above this share of dropped pages, whole-document plain text replaces interleaving. */
const DROPPED_PAGE_MAJORITY = 0.5;
/** Cap on the per-page pdfjs recovery walk; see `extractPdf`. */
const MAX_RECOVERED_PAGES = 250;
/**
 * Most pages this parser will accept at all.
 *
 * Past the recovery cap, unprobed pages are reported as needing OCR, which is a request
 * to send the whole document to a configured provider. A page costs about 100 bytes to
 * declare, so without this a 1MB upload buys a ten-thousand-page OCR job on someone
 * else's bill. The cap sits at what OCR services accept anyway, so it refuses nothing
 * that would have succeeded downstream.
 */
const MAX_PDF_PAGES = 1000;

/**
 * pdf-inspector reads PDF and nothing else: every export and type in its typings is
 * shaped around a PDF page, and no other format exists in the library. The type is
 * still checked here so direct callers receive a named error rather than an obscure
 * native failure.
 */
export const pdfInspectorSupportedMimeTypes: RegExp[] = [/^application\/pdf$/];

/**
 * Extracts an uploaded PDF with pdf-inspector, recovering layout (headings, tables,
 * reading order across columns) and reporting which pages are image-based.
 *
 * If pdf-inspector cannot read the structure, the adapter falls back to the flat
 * pdfjs extractor, which rebuilds damaged xref tables that the native engine rejects.
 * This recovery stays inside the PDF module so callers see one local parser contract.
 *
 * @throws {Error} when the file is not a PDF or neither engine can read it.
 */
export async function parseWithPdfInspector(
  file: Express.Multer.File,
  signal?: AbortSignal,
): Promise<ParsedDocumentUploadResult> {
  assertSupportedMimeType(file);

  const data = await fs.promises.readFile(file.path);
  let parsed: ParsedDocument;
  try {
    parsed = await extractPdf(file.path, data, signal);
  } catch (error) {
    /* Refusals are not "this engine could not read it", and pdfjs is not the answer to
     * any of them: it would run the walk inline for a request the limiter just refused,
     * rebuild in the API process the string the child declined to send, or accept a page
     * count this parser has already decided not to hand onward. A cancelled parse is the
     * same story at its sharpest: nobody is waiting for the answer, so starting a second
     * engine would hold the admission slot to produce something no one reads. */
    if (
      signal?.aborted ||
      error instanceof ConcurrencyLimitError ||
      error instanceof PdfPageLimitError ||
      isParserOutputLimit(error)
    ) {
      throw error;
    }
    logger.warn(
      `[pdfInspector] Native extraction failed for "${file.originalname}", falling back to pdfjs:`,
      error,
    );
    /* The whole-document fallback answers to the parser's own ceiling, not the recovery
     * walk's: they bound different work, and reusing the smaller one meant a PDF this
     * parser accepts with a good xref was refused with a damaged one, or on a platform
     * with no native binding at all. */
    parsed = await extractDocumentTextWithPages(data, MAX_PDF_PAGES, undefined, signal);
  }
  const { text, pagesNeedingOcr, mayEmbedMedia } = parsed;

  return {
    filename: file.originalname,
    bytes: Buffer.byteLength(text, 'utf8'),
    filepath: FileSources.pdf_inspector,
    text,
    images: [],
    pagesNeedingOcr,
    ...(mayEmbedMedia && { mayEmbedMedia }),
  };
}

function assertSupportedMimeType(file: Express.Multer.File): void {
  const mimetype = (file.mimetype ?? '').toLowerCase();
  if (pdfInspectorSupportedMimeTypes.some((supported) => supported.test(mimetype))) {
    return;
  }
  throw new Error(
    `pdf-inspector only extracts PDF files, but received "${file.mimetype || 'unknown'}".`,
  );
}

/**
 * Extracts a PDF per page: pdf-inspector's markdown where it produced any, the raw
 * text layer via pdfjs where it did not.
 *
 * pdf-inspector applies quality heuristics (garbled text, GID-encoded fonts) that
 * reject low-quality embedded OCR layers outright. On a 157-page scanned press kit
 * with a poor OCR layer it kept 5 pages and silently dropped 152 while reporting
 * only 13 as needing OCR, so neither its markdown nor its page accounting can be
 * trusted on its own. A degraded text layer still beats losing the page, so dropped
 * pages fall back to pdfjs, which reads the layer verbatim.
 *
 * Pages are reported as needing OCR only when both engines find nothing, an
 * empirical test that replaces trusting the reason codes.
 *
 * The pdf-inspector calls run in a child process (see `./native`); pdfjs reads
 * the already-loaded buffer inline, since it yields on its own.
 *
 * @throws {Error} when pdf-inspector reports no pages at all, so the caller falls
 * back to pdfjs instead of returning the empty string a page-less join produces.
 */
export async function extractPdf(
  filePath: string,
  data: Buffer,
  signal?: AbortSignal,
): Promise<ParsedDocument> {
  const extraction = await extractPagesMarkdownIsolated(filePath, signal);
  const pages = [...extraction.pages].sort((a, b) => a.page - b.page);
  if (!pages.length) {
    throw new Error('pdf-inspector returned no pages');
  }
  if (pages.length > MAX_PDF_PAGES) {
    throw new PdfPageLimitError(pages.length, MAX_PDF_PAGES);
  }

  /* The engine flags pages whose text it considers unreliable. Where it produced no
   * markdown the empirical probe below is the better judge, but a page that came back
   * with text and a flag is the one case nothing else can see: selectable text next to
   * a scan holding more of it. PDFs have no media manifest to consult, so this is the
   * signal that a configured OCR service may still have something to recover. */
  const scanned = new Set(extraction.scannedPages);
  const mayEmbedMedia = pages.some((page) => !!page.markdown?.trim() && scanned.has(page.page + 1));
  const withMediaSignal = (parsed: ParsedDocument): ParsedDocument =>
    mayEmbedMedia ? { ...parsed, mayEmbedMedia } : parsed;

  const droppedPages = pages.filter((page) => !page.markdown?.trim());
  if (!droppedPages.length) {
    return withMediaSignal({ text: pages.map((page) => page.markdown).join('\n\n') });
  }

  /* Recovery reads one page at a time and cannot be batched, so its cost is linear
   * in dropped pages (~20ms each) while a page object costs an attacker ~110 bytes.
   * A 10MB PDF of empty pages therefore buys hours of CPU on the request path unless
   * the walk is bounded. Past the cap, pages are reported as needing OCR rather than
   * probed: the same conservative degradation this function already applies when
   * pdfjs is unavailable. The cap sits above the 157-page document that motivated
   * per-page recovery, so real scanned files are unaffected. */
  const recoverablePages = droppedPages.slice(0, MAX_RECOVERED_PAGES);
  if (droppedPages.length > recoverablePages.length) {
    logger.warn(
      `[pdfInspector] ${droppedPages.length} pages lack extractable markdown; recovering the first ${MAX_RECOVERED_PAGES} and reporting the rest as needing OCR.`,
    );
  }

  /* Recovery shares the document's budget rather than getting a fresh one: its text is
   * joined with the native markdown below, so two independent caps would let the pair
   * reach twice the limit before anything downstream could refuse it. */
  const nativeBytes = pages.reduce(
    (total, page) => total + Buffer.byteLength(page.markdown ?? '', 'utf8'),
    0,
  );
  const recovered = await extractPageText(
    data,
    recoverablePages.map((page) => page.page),
    Math.max(0, MAX_PARSER_OUTPUT_BYTES - nativeBytes),
    signal,
  );
  /* Probed pages were empirically shown to hold no text layer at all. Pages past the
   * cap were never read, so they are only missing from output that skips them. Kept
   * apart because the two whole-document branches below omit different sets. */
  const probedMissingPages = recoverablePages
    .filter((page) => !recovered.get(page.page)?.trim())
    .map((page) => page.page + 1);
  const unprobedPages = droppedPages.slice(recoverablePages.length).map((page) => page.page + 1);
  const missingPages = [...probedMissingPages, ...unprobedPages];
  const ocrResult = missingPages.length ? missingPages : undefined;

  /* When most pages were dropped, the letter-spacing baked into this kind of OCR
   * layer makes item-level pdfjs assembly output mush ("m i s s i o n"): the word
   * boundaries are not in the strings, only in the glyph positions. pdf-inspector's
   * plain-text extractor re-segments words from those positions, so with structure
   * available for only a sliver of pages, clean words for the whole document beat
   * markdown islands in a sea of mush. Page accounting stays empirical either way. */
  /* Whole-document text is only taken when every dropped page was actually probed.
   * Past the recovery cap the accounting stops being knowable either way: the output
   * proves some text exists somewhere, not that each unprobed page had a layer, so
   * claiming they were omitted would be a false notice and staying silent would drop
   * scanned pages without ever reaching OCR. Interleaving keeps the report true, since
   * there an unprobed page really is missing from the text. */
  const everyDroppedPageProbed = droppedPages.length === recoverablePages.length;
  if (everyDroppedPageProbed && droppedPages.length > pages.length * DROPPED_PAGE_MAJORITY) {
    try {
      const plain = await extractTextIsolated(filePath, signal);
      if (plain.trim()) {
        return withMediaSignal({ text: plain, pagesNeedingOcr: ocrResult });
      }
    } catch {
      /* fall through to per-page interleaving */
    }
  }

  const parts: string[] = [];
  for (const page of pages) {
    if (page.markdown?.trim()) {
      parts.push(page.markdown);
      continue;
    }
    const legacyText = recovered.get(page.page)?.trim();
    if (legacyText) {
      parts.push(legacyText);
    }
  }

  return withMediaSignal({
    text: parts.join('\n\n'),
    pagesNeedingOcr: ocrResult,
  });
}
