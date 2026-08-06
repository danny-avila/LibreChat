import * as fs from 'fs';
import yauzl from 'yauzl';
import { logger } from '@librechat/data-schemas';
import { megabyte, excelMimeTypes, FileSources } from 'librechat-data-provider';
import type { ParsedDocumentUploadResult } from '~/types';
import { assertSafeZipSize, assertSafeZipSizeIfArchive } from './zipSafety';
import { extractPdf } from '~/files/pdfInspector';
import { extractDocumentText } from './pdfjs';
import { extractPptxSlides } from './html';

type ParsedDocument = Pick<ParsedDocumentUploadResult, 'text' | 'pagesNeedingOcr'>;

type FileParseFn = (file: Express.Multer.File) => Promise<ParsedDocument>;

const DOCUMENT_PARSER_MAX_FILE_SIZE = 15 * megabyte;
const ODT_MAX_DECOMPRESSED_SIZE = 50 * megabyte;
/** Cap on pages named in the omission notice, so a mostly-scanned document cannot
 * turn the notice itself into hundreds of KB of text persisted on every turn. */
const MAX_LISTED_MISSING_PAGES = 20;

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
  const listed = pagesNeedingOcr.slice(0, MAX_LISTED_MISSING_PAGES);
  const remaining = pagesNeedingOcr.length - listed.length;
  const pages = remaining ? `${listed.join(', ')} and ${remaining} more` : listed.join(', ');
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
}): Promise<ParsedDocumentUploadResult> {
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

/** Maps a MIME type to its built-in parser function, or `undefined` if unsupported. */
function getParserForMimeType(mimetype: string): FileParseFn | undefined {
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
    return await extractPdf(file.path, data);
  } catch (error) {
    logger.warn(
      `[parseDocument] pdf-inspector failed for "${file.originalname}", falling back to pdfjs:`,
      error,
    );
  }

  return { text: await extractDocumentText(data) };
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
   * `.xls` (BIFF/CFB) is not a ZIP, so the guard no-ops for it. */
  await assertSafeZipSizeIfArchive(data, { name: file.originalname ?? 'spreadsheet' });
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
