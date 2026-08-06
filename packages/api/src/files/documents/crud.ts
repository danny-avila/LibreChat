import * as fs from 'fs';
import yauzl from 'yauzl';
import { logger } from '@librechat/data-schemas';
import { megabyte, excelMimeTypes, FileSources } from 'librechat-data-provider';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import type { MistralOCRUploadResult } from '~/types';
import { assertSafeZipSize } from './zipSafety';
import { extractPptxSlides } from './html';
import { isEnabled } from '~/utils/common';

interface ParsedDocument {
  text: string;
  /** 1-indexed pages whose text could not be extracted, when the parser can tell. */
  pagesNeedingOcr?: number[];
}

type FileParseFn = (file: Express.Multer.File) => Promise<ParsedDocument>;

const DOCUMENT_PARSER_MAX_FILE_SIZE = 15 * megabyte;
const ODT_MAX_DECOMPRESSED_SIZE = 50 * megabyte;

/**
 * Appends a visible notice naming the pages that hold no extractable text.
 *
 * A part-scanned document otherwise yields partial text with nothing to signal the
 * omission, leaving both the user and the model to treat an incomplete document as
 * complete. Returns `text` unchanged when every page was extracted.
 */
export function annotateMissingPages(text: string, pagesNeedingOcr?: number[]): string {
  if (!pagesNeedingOcr?.length) {
    return text;
  }
  const pages = pagesNeedingOcr.join(', ');
  const notice =
    pagesNeedingOcr.length === 1
      ? `Page ${pages} of this document contains no extractable text and was omitted. It is image-based and requires an OCR service to read.`
      : `Pages ${pages} of this document contain no extractable text and were omitted. They are image-based and require an OCR service to read.`;
  return `${text}\n\n[${notice}]\n`;
}

/**
 * Parses an uploaded document and extracts its text content and metadata.
 * Handled types must stay in sync with `documentParserMimeTypes` from data-provider.
 *
 * @throws {Error} if `file.mimetype` is not handled, file exceeds size limit, or no text is found.
 */
export async function parseDocument({
  file,
}: {
  file: Express.Multer.File;
}): Promise<MistralOCRUploadResult> {
  const parseFn = getParserForMimeType(file.mimetype);
  if (!parseFn) {
    throw new Error(`Unsupported file type in document parser: ${file.mimetype}`);
  }

  const fileSize = file.size ?? (file.path != null ? (await fs.promises.stat(file.path)).size : 0);
  if (fileSize > DOCUMENT_PARSER_MAX_FILE_SIZE) {
    const limitMB = DOCUMENT_PARSER_MAX_FILE_SIZE / megabyte;
    const sizeMB = Math.ceil(fileSize / megabyte);
    throw new Error(
      `File "${file.originalname}" exceeds the ${limitMB}MB document parser limit (${sizeMB}MB).`,
    );
  }

  const { text, pagesNeedingOcr } = await parseFn(file);

  if (!text?.trim()) {
    throw new Error('No text found in document');
  }

  return {
    filename: file.originalname,
    bytes: Buffer.byteLength(text, 'utf8'),
    filepath: FileSources.document_parser,
    text,
    images: [],
    pagesNeedingOcr,
  };
}

/**
 * Office formats where anydoc overlaps the built-in parsers.
 *
 * PDF is deliberately excluded: it already goes through pdf-inspector directly,
 * which is the same engine anydoc would use for it, and the direct path also
 * surfaces `pagesNeedingOcr`.
 */
const ANYDOC_MIME_TYPES = [
  /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
  /^application\/vnd\.openxmlformats-officedocument\.presentationml\.presentation$/,
  excelMimeTypes,
  /^application\/vnd\.oasis\.opendocument\.spreadsheet$/,
  /^application\/vnd\.oasis\.opendocument\.text$/,
];

/**
 * Maps a MIME type to its document parser function, or `undefined` if unsupported.
 *
 * With `DOCUMENT_PARSER_ANYDOC` enabled, office formats are routed through anydoc
 * and fall back to the built-in parser if it throws.
 */
function getParserForMimeType(mimetype: string): FileParseFn | undefined {
  const builtIn = getBuiltInParser(mimetype);
  if (!builtIn || !isEnabled(process.env.DOCUMENT_PARSER_ANYDOC)) {
    return builtIn;
  }
  if (!ANYDOC_MIME_TYPES.some((regex) => regex.test(mimetype))) {
    return builtIn;
  }
  return (file) => officeToText(file, builtIn);
}

/**
 * Converts an office document to Markdown with anydoc, recovering headings, tables
 * and emphasis that the built-in extractors drop.
 *
 * anydoc applies no decompression limit of its own: a 158KB DOCX whose document.xml
 * inflates to 78MB is parsed in full, ~400MB RSS. The zip guard therefore has to run
 * on the raw buffer before anydoc sees it, exactly as it does for mammoth.
 */
async function officeToText(
  file: Express.Multer.File,
  builtIn: FileParseFn,
): Promise<ParsedDocument> {
  try {
    const buffer = await fs.promises.readFile(file.path);
    if (isZipArchive(buffer)) {
      await assertSafeZipSize(buffer, { name: file.originalname ?? 'document' });
    }
    const { toMarkdownBytes, formatFromPath } = await import('@firecrawl/anydoc');
    const format = formatFromPath(file.originalname ?? file.path);
    const text = await toMarkdownBytes(new Uint8Array(buffer), format);
    if (text?.trim()) {
      return { text };
    }
    logger.warn(`[parseDocument] anydoc returned no text for "${file.originalname}"`);
  } catch (error) {
    logger.warn(
      `[parseDocument] anydoc failed for "${file.originalname}", falling back to the built-in parser:`,
      error,
    );
  }
  return builtIn(file);
}

/** `.xls` (BIFF/CFB) is not a ZIP, so the zip guard does not apply to it. */
function isZipArchive(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function getBuiltInParser(mimetype: string): FileParseFn | undefined {
  if (mimetype === 'application/pdf') {
    return pdfToText;
  }
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return wordDocToText;
  }
  if (
    excelMimeTypes.test(mimetype) ||
    mimetype === 'application/vnd.oasis.opendocument.spreadsheet'
  ) {
    return excelSheetToText;
  }
  if (mimetype === 'application/vnd.oasis.opendocument.text') {
    return odtToText;
  }
  if (mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
    return pptxToText;
  }
  return undefined;
}

/**
 * Parses PowerPoint, returning each slide's title and body text.
 *
 * Reuses the slide reader behind the office preview, which already caps slide count
 * and per-entry decompressed size. Table cells surface as loose paragraphs because
 * PPTX cells are ordinary `<a:p>` runs; anydoc recovers the table structure.
 */
async function pptxToText(file: Express.Multer.File): Promise<ParsedDocument> {
  const buffer = await fs.promises.readFile(file.path);
  const slides = await extractPptxSlides(buffer);

  const text = slides
    .map(({ number, title, body }) => {
      const lines = [`Slide ${number}${title ? `: ${title}` : ''}`, ...body];
      return lines.join('\n');
    })
    .join('\n\n');

  return { text };
}

/**
 * Parses PDF, returns text inside.
 *
 * Primary path is pdf-inspector, which recovers layout (headings, tables, reading order
 * across columns) and reports which pages are image-based. pdfjs is kept as a real
 * fallback rather than a platform guard: it reconstructs damaged xref tables that
 * pdf-inspector rejects outright, so documents that parse today keep parsing.
 */
async function pdfToText(file: Express.Multer.File): Promise<ParsedDocument> {
  const data = await fs.promises.readFile(file.path);

  try {
    return await pdfToTextInspector(data);
  } catch (error) {
    logger.warn(
      `[parseDocument] pdf-inspector failed for "${file.originalname}", falling back to pdfjs:`,
      error,
    );
  }

  return { text: await pdfToTextLegacy(data) };
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
 */
/** Above this share of dropped pages, whole-document plain text replaces interleaving. */
const DROPPED_PAGE_MAJORITY = 0.5;

async function pdfToTextInspector(data: Buffer): Promise<ParsedDocument> {
  // Imported inline so that Jest can test other routes without loading the native binding
  const { extractPagesMarkdown, extractText } = await import('@firecrawl/pdf-inspector');
  const result = extractPagesMarkdown(data);
  const pages = [...result.pages].sort((a, b) => a.page - b.page);

  const droppedPages = pages.filter((page) => !page.markdown?.trim());
  if (!droppedPages.length) {
    return { text: pages.map((page) => page.markdown).join('\n\n') };
  }

  const recovered = await extractPageTextLegacy(
    data,
    droppedPages.map((page) => page.page),
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
      const plain = extractText(data);
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

/**
 * Reads the raw text layer of specific 0-indexed pages with pdfjs.
 *
 * Failure here must not fail the document: pages that cannot be recovered are
 * reported in `pagesNeedingOcr` instead, so an unavailable or broken pdfjs
 * degrades to a visible omission notice rather than a parse error.
 */
async function extractPageTextLegacy(
  data: Buffer,
  pageIndexes: number[],
): Promise<Map<number, string>> {
  const texts = new Map<number, string>();
  let pdf;
  try {
    // Imported inline so that Jest can test other routes without failing due to loading ESM
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdf = await getDocument({ data: new Uint8Array(data) }).promise;
  } catch (error) {
    logger.warn('[parseDocument] pdfjs unavailable for page recovery:', error);
    return texts;
  }

  for (const pageIndex of pageIndexes) {
    try {
      const page = await pdf.getPage(pageIndex + 1);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item): item is TextItem => !('type' in item))
        .map((item) => item.str)
        .join(' ');
      texts.set(pageIndex, pageText);
    } catch {
      /* An unreadable page is reported in pagesNeedingOcr rather than failing the document. */
    }
  }
  return texts;
}

async function pdfToTextLegacy(data: Buffer): Promise<string> {
  // Imported inline so that Jest can test other routes without failing due to loading ESM
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const pdf = await getDocument({ data: new Uint8Array(data) }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .filter((item): item is TextItem => !('type' in item))
      .map((item) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
}

/** Parses Word document, returns text inside. */
async function wordDocToText(file: Express.Multer.File): Promise<ParsedDocument> {
  const buffer = await fs.promises.readFile(file.path);
  /* Reject zip-bomb DOCX before mammoth's internal extractor runs.
   * mammoth has no decompressed-size cap of its own; without this, a
   * sub-1MB compressed bomb (~200x ratio) would block the event loop
   * and spike RSS to ~1GB. See SEC review on PR #12934. */
  await assertSafeZipSize(buffer, { name: file.originalname ?? 'docx' });
  const { extractRawText } = await import('mammoth');
  const rawText = await extractRawText({ buffer });
  return { text: rawText.value };
}

/** Parses Excel sheet, returns text inside. */
async function excelSheetToText(file: Express.Multer.File): Promise<ParsedDocument> {
  // xlsx CDN build (0.20.x) does not bind fs internally when dynamically imported;
  // readFile() fails with "Cannot access file". read() takes a pre-loaded Buffer instead.
  const { read, utils } = await import('xlsx');
  const data = await fs.promises.readFile(file.path);
  /* Reject zip-bomb XLSX/ODS before SheetJS's internal extractor runs.
   * `.xls` (BIFF/CFB) is not a ZIP — magic-byte check skips the
   * validator for it (yauzl would reject it as malformed anyway). */
  if (data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b) {
    await assertSafeZipSize(data, { name: file.originalname ?? 'spreadsheet' });
  }
  const workbook = read(data, { type: 'buffer' });

  let text = '';
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const worksheetAsCsvString = utils.sheet_to_csv(worksheet);
    text += `${sheetName}:\n${worksheetAsCsvString}\n`;
  }

  return { text };
}

/**
 * Parses OpenDocument Text (.odt) by extracting the body text from content.xml.
 * Uses regex-based XML extraction scoped to <office:body>: paragraph/heading
 * boundaries become newlines, tab and spacing elements are preserved, and the
 * five standard XML entities are decoded. Complex elements such as frames,
 * text boxes, and annotations are stripped without replacement.
 */
async function odtToText(file: Express.Multer.File): Promise<ParsedDocument> {
  const xml = await extractOdtContentXml(file.path);
  const bodyMatch = xml.match(/<office:body[^>]*>([\s\S]*?)<\/office:body>/);
  if (!bodyMatch) {
    return { text: '' };
  }
  const text = bodyMatch[1]
    .replace(/<\/text:p>/g, '\n')
    .replace(/<\/text:h>/g, '\n')
    .replace(/<text:line-break\/>/g, '\n')
    .replace(/<text:tab\/>/g, '\t')
    .replace(/<text:s[^>]*\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text };
}

/**
 * Streams content.xml out of an ODT ZIP archive using yauzl, counting real
 * decompressed bytes and aborting mid-inflate if the cap is exceeded.
 * Unlike JSZip metadata checks, this cannot be bypassed by falsifying
 * the ZIP central directory's uncompressedSize fields.
 *
 * The zipfile is closed on all exit paths (success, size cap, missing entry,
 * error) to prevent file descriptor leaks.
 */
function extractOdtContentXml(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        return reject(err);
      }
      if (!zipfile) {
        return reject(new Error('Failed to open ODT file'));
      }

      let settled = false;
      const finish = (error: Error | null, result?: string) => {
        if (settled) {
          return;
        }
        settled = true;
        zipfile.close();
        if (error) {
          reject(error);
        } else {
          resolve(result as string);
        }
      };

      let found = false;
      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName !== 'content.xml') {
          zipfile.readEntry();
          return;
        }
        found = true;
        zipfile.openReadStream(entry, (streamErr, readStream) => {
          if (streamErr) {
            return finish(streamErr);
          }
          if (!readStream) {
            return finish(new Error('Failed to open content.xml stream'));
          }

          let totalBytes = 0;
          const chunks: Buffer[] = [];

          readStream.on('data', (chunk: Buffer) => {
            totalBytes += chunk.byteLength;
            if (totalBytes > ODT_MAX_DECOMPRESSED_SIZE) {
              readStream.destroy(
                new Error(
                  `ODT content.xml exceeds the ${ODT_MAX_DECOMPRESSED_SIZE / megabyte}MB decompressed limit`,
                ),
              );
              return;
            }
            chunks.push(chunk);
          });

          readStream.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
          readStream.on('error', (readErr: Error) => finish(readErr));
        });
      });

      zipfile.on('end', () => {
        if (!found) {
          finish(new Error('ODT file is missing content.xml'));
        }
      });

      zipfile.on('error', (zipErr: Error) => finish(zipErr));
    });
  });
}
