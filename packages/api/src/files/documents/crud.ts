import * as fs from 'fs';
import { megabyte } from 'librechat-data-provider';
import type { ParsedDocumentUploadResult } from '~/types';
import { parseWithPdfInspector } from '~/files/pdfInspector';
import { withParserAdmission } from './nativeProcess';
import { parseWithAnydoc } from '~/files/anydoc';

const DOCUMENT_PARSER_MAX_FILE_SIZE = 15 * megabyte;
const GENERIC_BINARY_MIME_TYPES = new Set(['application/octet-stream', 'binary/octet-stream']);
/** Cap on pages named in the omission notice, so a mostly-scanned document cannot
 * turn the notice itself into hundreds of KB of text persisted on every turn. */
const MAX_LISTED_MISSING_PAGES = 20;

/** Formats a bounded page list for persistence and logging. */
export function summarizeMissingPages(pagesNeedingOcr: readonly number[]): string {
  const listed = pagesNeedingOcr.slice(0, MAX_LISTED_MISSING_PAGES);
  const remaining = pagesNeedingOcr.length - listed.length;
  return remaining ? `${listed.join(', ')} and ${remaining} more` : listed.join(', ');
}

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
  const pages = summarizeMissingPages(pagesNeedingOcr);
  const notice =
    pagesNeedingOcr.length === 1
      ? `Page ${pages} of this document contains no extractable text and was omitted. It is image-based and requires an OCR service to read.`
      : `Pages ${pages} of this document contain no extractable text and were omitted. They are image-based and require an OCR service to read.`;
  return `${text}\n\n[${notice}]\n`;
}

/**
 * Parses an uploaded document with the local engine specialized for its format.
 * PDFs use the direct pdf-inspector adapter so page-level OCR needs and pdfjs
 * recovery are preserved. Every other accepted document goes through AnyDoc.
 *
 * The administrator-facing `fileConfig.documentParser.supportedMimeTypes` gate is
 * evaluated by the upload router before this function. Each engine still validates
 * its own technical defaults here so direct callers receive a named error.
 */
export async function parseDocument({
  file,
  signal,
}: {
  file: Express.Multer.File;
  /** Cancels the parse and frees its admission slot when the caller stops waiting. */
  signal?: AbortSignal;
}): Promise<ParsedDocumentUploadResult> {
  const fileSize = file.size ?? (file.path != null ? (await fs.promises.stat(file.path)).size : 0);
  if (fileSize > DOCUMENT_PARSER_MAX_FILE_SIZE) {
    const limitMB = DOCUMENT_PARSER_MAX_FILE_SIZE / megabyte;
    const sizeMB = Math.ceil(fileSize / megabyte);
    throw new Error(
      `File "${file.originalname}" exceeds the ${limitMB}MB document parser limit (${sizeMB}MB).`,
    );
  }

  const declaredMimeType = (file.mimetype ?? '').split(';')[0].trim().toLowerCase();
  const isGenericPdf =
    GENERIC_BINARY_MIME_TYPES.has(declaredMimeType) && /\.pdf$/i.test(file.originalname);
  const mimetype = isGenericPdf ? 'application/pdf' : declaredMimeType;
  const parserFile = mimetype === file.mimetype ? file : { ...file, mimetype };
  /* Admission covers the whole parse. A PDF is a child process, then in-process pdfjs
   * recovery, then possibly a second child, and bounding only the children would leave
   * the recovery to pile up behind a cap that never counted it. */
  const result = await withParserAdmission(
    () =>
      mimetype === 'application/pdf'
        ? parseWithPdfInspector(parserFile, signal)
        : parseWithAnydoc(parserFile, signal),
    signal,
  );

  if (!result.text?.trim()) {
    throw new Error('No text found in document');
  }

  return result;
}
