import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { CodeArtifactCategory } from './classify';
import { parseDocument } from '~/files/documents/crud';
import { isBinaryBuffer } from '~/skills/binary';
import { withTimeout } from '~/utils/promise';

export const MAX_TEXT_CACHE_BYTES = 512 * 1024;
export const MAX_TEXT_EXTRACT_BYTES = 1024 * 1024;
const DOCUMENT_PARSE_TIMEOUT_MS = 8_000;
const TRUNCATION_MARKER = '\n\n…[truncated]';
const TRUNCATION_MARKER_BYTES = Buffer.byteLength(TRUNCATION_MARKER, 'utf-8');

/**
 * Truncate UTF-8 content to fit within MAX_TEXT_CACHE_BYTES. Walks back to a
 * code-point boundary so the cut never lands inside a multi-byte sequence
 * (which would emit a U+FFFD replacement character — a real concern for CJK
 * and emoji-heavy content). Accepts an optional pre-built buffer to avoid
 * re-encoding when the caller already has one.
 */
const truncate = (text: string, originalBuffer?: Buffer): string => {
  const buffer = originalBuffer ?? Buffer.from(text, 'utf-8');
  if (buffer.length <= MAX_TEXT_CACHE_BYTES) {
    return text;
  }
  let sliceLen = Math.max(0, MAX_TEXT_CACHE_BYTES - TRUNCATION_MARKER_BYTES);
  // UTF-8 continuation bytes match 0b10xxxxxx; keep walking back while the
  // proposed cut would split a sequence.
  while (sliceLen > 0 && (buffer[sliceLen] & 0xc0) === 0x80) {
    sliceLen--;
  }
  return buffer.subarray(0, sliceLen).toString('utf-8') + TRUNCATION_MARKER;
};

const extractUtf8 = (buffer: Buffer): string | null => {
  if (isBinaryBuffer(buffer)) {
    return null;
  }
  if (buffer.length <= MAX_TEXT_CACHE_BYTES) {
    return buffer.toString('utf-8');
  }
  return truncate(buffer.toString('utf-8'), buffer);
};

/**
 * Map a known office-document extension back to its canonical MIME so we can
 * route through `parseDocument` even when buffer-sniffing yielded a generic
 * value like `application/zip` or `application/octet-stream`. `parseDocument`
 * dispatches strictly by MIME, so without this remap a `.docx` with a sniffed
 * `application/zip` would silently fall back to `null`.
 */
const documentMimeFromExtension = (name: string): string | null => {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls':
      return 'application/vnd.ms-excel';
    case '.ods':
      return 'application/vnd.oasis.opendocument.spreadsheet';
    case '.odt':
      return 'application/vnd.oasis.opendocument.text';
    default:
      return null;
  }
};

const extractDocument = async (
  buffer: Buffer,
  name: string,
  mimeType: string,
): Promise<string | null> => {
  const canonicalMime = documentMimeFromExtension(name) ?? mimeType;
  const tempPath = path.join(os.tmpdir(), `code-artifact-${randomUUID()}`);
  await fs.writeFile(tempPath, buffer);
  try {
    const result = await withTimeout(
      parseDocument({
        file: {
          path: tempPath,
          size: buffer.length,
          mimetype: canonicalMime,
          originalname: path.basename(name),
        } as Express.Multer.File,
      }),
      DOCUMENT_PARSE_TIMEOUT_MS,
      `parseDocument exceeded ${DOCUMENT_PARSE_TIMEOUT_MS}ms`,
    );
    if (!result?.text) {
      return null;
    }
    return truncate(result.text);
  } finally {
    fs.unlink(tempPath).catch(() => {});
  }
};

/**
 * Extract a UTF-8 text representation of a code-execution artifact for inline
 * rendering. Returns `null` for binary, oversized, or unsupported files; the
 * caller should fall back to the standard download UI in that case.
 *
 * - utf8-text: decodes the buffer (with a binary safety net)
 * - document: dispatches to the existing PDF/DOCX/XLSX/ODT parser
 * - pptx: not yet supported in this PR — returns null (follow-up work)
 * - other: returns null (binary file, no inline preview)
 */
export async function extractCodeArtifactText(
  buffer: Buffer,
  name: string,
  mimeType: string,
  category: CodeArtifactCategory,
): Promise<string | null> {
  if (category === 'other' || category === 'pptx') {
    return null;
  }
  if (buffer.length > MAX_TEXT_EXTRACT_BYTES) {
    return null;
  }
  try {
    if (category === 'utf8-text') {
      return extractUtf8(buffer);
    }
    return await extractDocument(buffer, name, mimeType);
  } catch (error) {
    logger.debug(
      `[extractCodeArtifactText] Failed to extract "${name}" (${mimeType}): ${(error as Error).message}`,
    );
    return null;
  }
}
