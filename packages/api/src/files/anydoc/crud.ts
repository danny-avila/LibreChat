import * as fs from 'fs';
import { logger } from '@librechat/data-schemas';
import { excelFileTypes, FileSources } from 'librechat-data-provider';
import type { ParsedDocumentUploadResult } from '~/types';
import { assertSafeZipSizeIfArchive } from '../documents/zipSafety';
import { hasEmbeddedMedia } from '../documents/media';
import { extractMarkdownIsolated } from './native';

/**
 * MIME types the local AnyDoc path declares support for.
 *
 * Hand-written because neither side can enumerate itself: anydoc's `Format` is a napi
 * `const enum` that resolves to `{}` at runtime, and the platform has no MIME table for
 * the container variants (`.docm`, `.xlsb`, `.ppsx`) that collapse onto those formats.
 * PDF is deliberately excluded even though the upstream library accepts it. LibreChat
 * routes PDFs directly through its richer pdf-inspector adapter, which preserves page
 * accounting and bounded pdfjs recovery.
 */
export const anydocMimeTypes: ReadonlySet<string> = new Set<string>([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-word.document.macroEnabled.12',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'application/epub+zip',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  'application/vnd.oasis.opendocument.presentation',
  ...excelFileTypes,
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

const ANYDOC_EXTENSION_FORMATS: Readonly<Record<string, string>> = {
  doc: 'doc',
  docx: 'docx',
  docm: 'docx',
  odt: 'odt',
  rtf: 'rtf',
  epub: 'epub',
  ppt: 'ppt',
  pps: 'ppt',
  pot: 'ppt',
  pptx: 'pptx',
  pptm: 'pptx',
  ppsx: 'pptx',
  ppsm: 'pptx',
  odp: 'odp',
  xls: 'xlsx',
  xlsx: 'xlsx',
  xlsm: 'xlsx',
  xlsb: 'xlsx',
  ods: 'ods',
  csv: 'csv',
  pdf: 'pdf',
};

/** Strips any `; charset=` parameter and folds case, so lookups match the table. */
function normalizeType(mimetype?: string): string {
  return (mimetype ?? '').split(';')[0].trim().toLowerCase();
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Pure extension mapping, so loading AnyDoc's native binding stays inside the child. */
function formatFromPath(name: string): string | null {
  const extension = name.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase();
  return extension ? (ANYDOC_EXTENSION_FORMATS[extension] ?? null) : null;
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
  if (type === 'application/pdf' || extensionFormat === 'pdf') {
    throw new Error(`PDF files are handled by pdf-inspector, not anydoc ("${name}").`);
  }
  if (foldedMimeTypes.has(type)) {
    if (extensionFormat == null) {
      logger.warn(
        `[parseWithAnydoc] "${name}" has no extension anydoc recognizes; falling back to content detection.`,
      );
    }
    return;
  }
  if (extensionFormat != null) {
    logger.warn(
      `[parseWithAnydoc] "${name}" arrived as "${type || 'no MIME type'}", which anydoc does not declare support for; its extension names "${extensionFormat}", so extraction is attempted anyway.`,
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
 * @throws {Error} when the type is unsupported, the archive fails the zip guard, anydoc
 * throws, or extraction yields nothing.
 */
export async function parseWithAnydoc(
  file: Express.Multer.File,
): Promise<ParsedDocumentUploadResult> {
  const name = file.originalname ?? file.path;
  const type = normalizeType(file.mimetype);

  const format = formatFromPath(name);
  assertSupportedType(name, type, format);

  const buffer = await fs.promises.readFile(file.path);
  await assertSafeZipSizeIfArchive(buffer, { name });
  /* Read from the buffer already in hand, before extraction: anydoc converts artwork
   * to nothing at all, so this is the only record that the Markdown below may be
   * missing what an embedded scan holds. */
  const embedsMedia = await hasEmbeddedMedia(buffer);

  let markdown: string;
  try {
    markdown = await extractMarkdownIsolated(file.path, format);
  } catch (error) {
    const message = toMessage(error);
    throw new Error(`anydoc failed to extract text from "${name}": ${message}`);
  }

  if (!markdown.trim()) {
    throw new Error(`anydoc extracted no text from "${name}".`);
  }

  return {
    filename: file.originalname,
    bytes: Buffer.byteLength(markdown, 'utf8'),
    filepath: FileSources.anydoc,
    text: markdown,
    images: [],
    ...(embedsMedia && { hasEmbeddedMedia: true }),
  };
}
