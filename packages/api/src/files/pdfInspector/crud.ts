import * as fs from 'fs';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { ParsedDocumentUploadResult } from '~/types';
import { extractPagesMarkdownIsolated, extractTextIsolated } from './native';
import { extractDocumentText, extractPageText } from '../documents/pdfjs';

type ParsedDocument = Pick<ParsedDocumentUploadResult, 'text' | 'pagesNeedingOcr'>;

/** Above this share of dropped pages, whole-document plain text replaces interleaving. */
const DROPPED_PAGE_MAJORITY = 0.5;
/** Cap on pages either pdfjs recovery path will read; see `extractPdf`. */
const MAX_RECOVERED_PAGES = 250;

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
): Promise<ParsedDocumentUploadResult> {
  assertSupportedMimeType(file);

  const data = await fs.promises.readFile(file.path);
  let parsed: ParsedDocument;
  try {
    parsed = await extractPdf(file.path, data);
  } catch (error) {
    logger.warn(
      `[pdfInspector] Native extraction failed for "${file.originalname}", falling back to pdfjs:`,
      error,
    );
    parsed = { text: await extractDocumentText(data, MAX_RECOVERED_PAGES) };
  }
  const { text, pagesNeedingOcr } = parsed;

  return {
    filename: file.originalname,
    bytes: Buffer.byteLength(text, 'utf8'),
    filepath: FileSources.pdf_inspector,
    text,
    images: [],
    pagesNeedingOcr,
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
export async function extractPdf(filePath: string, data: Buffer): Promise<ParsedDocument> {
  const pages = [...(await extractPagesMarkdownIsolated(filePath))].sort((a, b) => a.page - b.page);
  if (!pages.length) {
    throw new Error('pdf-inspector returned no pages');
  }

  const droppedPages = pages.filter((page) => !page.markdown?.trim());
  if (!droppedPages.length) {
    return { text: pages.map((page) => page.markdown).join('\n\n') };
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

  const recovered = await extractPageText(
    data,
    recoverablePages.map((page) => page.page),
  );
  const pagesNeedingOcr = droppedPages
    .filter((page) => !recovered.get(page.page)?.trim())
    .map((page) => page.page + 1);
  const ocrResult = pagesNeedingOcr.length ? pagesNeedingOcr : undefined;

  /* When most pages were dropped, the letter-spacing baked into this kind of OCR
   * layer makes item-level pdfjs assembly output mush ("m i s s i o n"): the word
   * boundaries are not in the strings, only in the glyph positions. pdf-inspector's
   * plain-text extractor re-segments words from those positions, so with structure
   * available for only a sliver of pages, clean words for the whole document beat
   * markdown islands in a sea of mush. Page accounting stays empirical either way. */
  if (droppedPages.length > pages.length * DROPPED_PAGE_MAJORITY) {
    try {
      const plain = await extractTextIsolated(filePath);
      if (plain.trim()) {
        return { text: plain, pagesNeedingOcr: ocrResult };
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

  return {
    text: parts.join('\n\n'),
    pagesNeedingOcr: ocrResult,
  };
}
