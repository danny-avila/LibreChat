import * as fs from 'fs';
import { logger } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import type { ParsedDocumentUploadResult, ServerRequest } from '~/types';
import { assertSafeZipSizeIfArchive } from '../documents/zipSafety';

/**
 * Extraction context, identical to the Mistral OCR providers so every strategy is
 * called the same way. anydoc runs in-process against the uploaded bytes, so `req`
 * and `loadAuthValues` are accepted and ignored.
 */
interface OCRContext {
  req: ServerRequest;
  file: Express.Multer.File;
  loadAuthValues: (params: {
    userId: string;
    authFields: string[];
    optional?: Set<string>;
  }) => Promise<Record<string, string | undefined>>;
}

/**
 * MIME types this provider declares support for.
 *
 * Hand-written because neither side can enumerate itself: anydoc's `Format` is a napi
 * `const enum` that resolves to `{}` at runtime, and the platform has no MIME table for
 * the container variants (`.docm`, `.xlsb`, `.ppsx`) that collapse onto those formats.
 * Mirrors the twelve members declared in `@firecrawl/anydoc`'s type definitions and the
 * extension table in its README.
 */
export const anydocMimeTypes: ReadonlySet<string> = new Set<string>([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-word.document.macroEnabled.12',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'application/pdf',
  'application/epub+zip',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
  'application/csv',
]);

/** MIME types are case-insensitive, so matching happens against a folded copy. */
const foldedMimeTypes: ReadonlySet<string> = new Set<string>(
  [...anydocMimeTypes].map((type) => type.toLowerCase()),
);

/**
 * anydoc's refusal for a PDF whose pages carry no text layer. Observed verbatim as
 * `unsupported input: PDF has no extractable text (Scanned, 1 pages): OCR is required`.
 */
const SCANNED_PDF_PATTERN = /OCR is required|no extractable text/i;

/** Strips any `; charset=` parameter and folds case, so lookups match the table. */
function normalizeType(mimetype?: string): string {
  return (mimetype ?? '').split(';')[0].trim().toLowerCase();
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Kept in step with the sentence `processAgentFileUpload` shows for the same situation. */
function imageBasedError(name: string): Error {
  return new Error(
    `Unable to extract text from "${name}" with anydoc. The document is image-based and requires an OCR service to process.`,
  );
}

/**
 * Refuses types anydoc cannot read, before the file is loaded from disk.
 *
 * Only the combination of an undeclared MIME type and an extension anydoc does not
 * recognize is a hard failure, because either signal alone is routinely wrong in
 * practice: browsers send `application/octet-stream` for perfectly ordinary office
 * documents, and uploads arrive with no extension at all. When one of the two says
 * the file is supported, the attempt is worth more than the refusal, so it proceeds
 * with a warning and anydoc gets to make the final call from the content itself.
 *
 * @throws {Error} when neither the MIME type nor the extension names a supported format.
 */
function assertSupportedType(name: string, type: string, extensionFormat: string | null): void {
  if (foldedMimeTypes.has(type)) {
    if (extensionFormat == null) {
      logger.warn(
        `[uploadAnydoc] "${name}" has no extension anydoc recognizes; falling back to content detection.`,
      );
    }
    return;
  }
  if (extensionFormat != null) {
    logger.warn(
      `[uploadAnydoc] "${name}" arrived as "${type || 'no MIME type'}", which anydoc does not declare support for; its extension names "${extensionFormat}", so extraction is attempted anyway.`,
    );
    return;
  }
  throw new Error(
    `Unsupported file type in the anydoc parser: "${type || 'unknown'}" ("${name}").`,
  );
}

/**
 * Converts an uploaded document to Markdown with anydoc, recovering headings, tables
 * and emphasis that plain-text extractors drop.
 *
 * The zip guard runs on the raw buffer before anydoc is handed a single byte, and sits
 * outside the try on purpose. anydoc applies no decompression cap of its own: a 158KB
 * DOCX whose document.xml inflates to 78MB is parsed in full at ~400MB RSS, and the
 * same bomb padded with junk bytes measures 162KB on disk for 80MB of Markdown at
 * ~336MB RSS. A refusal therefore has to propagate as a refusal; reporting it as
 * "anydoc failed" would let the shared parser's fallback chain hand the very file the
 * guard exists to stop to another inflating parser.
 *
 * PDFs go through pdf-inspector inside anydoc, which emits Markdown directly and errors
 * as unsupported on scanned or image-only pages. That refusal is translated here into
 * the same actionable sentence the rest of the upload path uses, rather than leaking a
 * library-internal message. Note that this provider cannot report `pagesNeedingOcr`:
 * anydoc returns one Markdown string with no page accounting, and on a part-scanned PDF
 * it silently omits the unreadable pages. The field is left undefined rather than
 * guessed, so a document whose pages were dropped carries no omission notice.
 *
 * @throws {Error} when the type is unsupported, the archive fails the zip guard, anydoc
 * throws, or extraction yields nothing.
 */
export async function uploadAnydoc(context: OCRContext): Promise<ParsedDocumentUploadResult> {
  const { file } = context;
  const name = file.originalname ?? file.path;
  const type = normalizeType(file.mimetype);

  const { toMarkdownBytes, formatFromPath } = await import('@firecrawl/anydoc');
  const format = formatFromPath(name);
  assertSupportedType(name, type, format);

  const buffer = await fs.promises.readFile(file.path);
  await assertSafeZipSizeIfArchive(buffer, { name });

  let markdown: string;
  try {
    markdown = await toMarkdownBytes(new Uint8Array(buffer), format);
  } catch (error) {
    const message = toMessage(error);
    if (SCANNED_PDF_PATTERN.test(message)) {
      throw imageBasedError(name);
    }
    throw new Error(`anydoc failed to extract text from "${name}": ${message}`);
  }

  if (!markdown.trim()) {
    if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
      throw imageBasedError(name);
    }
    throw new Error(`anydoc extracted no text from "${name}".`);
  }

  return {
    filename: file.originalname,
    bytes: Buffer.byteLength(markdown, 'utf8'),
    filepath: FileSources.anydoc,
    text: markdown,
    images: [],
  };
}
