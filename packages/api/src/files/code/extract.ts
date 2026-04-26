import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from '@librechat/data-schemas';
import type { CodeArtifactCategory } from './classify';
import { parseDocument } from '~/files/documents/crud';
import { isBinaryBuffer } from '~/skills/binary';

export const MAX_TEXT_CACHE_BYTES = 512 * 1024;
export const MAX_TEXT_EXTRACT_BYTES = 1024 * 1024;
const TRUNCATION_MARKER = '\n\n…[truncated]';

const truncate = (text: string): string => {
  if (Buffer.byteLength(text, 'utf-8') <= MAX_TEXT_CACHE_BYTES) {
    return text;
  }
  const sliceLen = Math.max(
    0,
    MAX_TEXT_CACHE_BYTES - Buffer.byteLength(TRUNCATION_MARKER, 'utf-8'),
  );
  const buffer = Buffer.from(text, 'utf-8');
  return buffer.subarray(0, sliceLen).toString('utf-8') + TRUNCATION_MARKER;
};

const extractUtf8 = (buffer: Buffer): string | null => {
  if (isBinaryBuffer(buffer)) {
    return null;
  }
  return truncate(buffer.toString('utf-8'));
};

const extractDocument = async (
  buffer: Buffer,
  name: string,
  mimeType: string,
): Promise<string | null> => {
  const tempPath = path.join(os.tmpdir(), `code-artifact-${process.pid}-${Date.now()}-${name}`);
  await fs.writeFile(tempPath, buffer);
  try {
    const result = await parseDocument({
      file: {
        path: tempPath,
        size: buffer.length,
        mimetype: mimeType,
        originalname: name,
      } as Express.Multer.File,
    });
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
