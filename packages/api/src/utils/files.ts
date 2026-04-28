import path from 'path';
import crypto from 'node:crypto';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';

const USER_FACING_UPLOAD_ERRORS = [
  'Invalid file format',
  'exceeds token limit',
  'Unable to extract text from',
] as const;

/**
 * Resolves a user-facing error message from a file upload error.
 * Returns the error's own message if it matches a known user-facing pattern,
 * otherwise returns the default message.
 */
export function resolveUploadErrorMessage(
  error: { message?: string } | null | undefined,
  defaultMessage = 'Error processing file',
): string {
  const errorMessage = error?.message;
  if (!errorMessage) {
    return defaultMessage;
  }

  if (errorMessage.includes('file_ids')) {
    return `${defaultMessage}: ${errorMessage}`;
  }

  for (const fragment of USER_FACING_UPLOAD_ERRORS) {
    if (errorMessage.includes(fragment)) {
      return errorMessage;
    }
  }

  return defaultMessage;
}

/**
 * Sanitize a filename by removing any directory components, replacing non-alphanumeric characters
 * @param inputName
 */
export function sanitizeFilename(inputName: string): string {
  // Remove any directory components
  let name = path.basename(inputName);

  // Replace any non-alphanumeric characters except for '.' and '-'
  name = name.replace(/[^a-zA-Z0-9.-]/g, '_');

  // Ensure the name doesn't start with a dot (hidden file in Unix-like systems)
  if (name.startsWith('.') || name === '') {
    name = '_' + name;
  }

  // Limit the length of the filename
  const MAX_LENGTH = 255;
  if (name.length > MAX_LENGTH) {
    const ext = path.extname(name);
    const nameWithoutExt = path.basename(name, ext);
    name =
      nameWithoutExt.slice(0, MAX_LENGTH - ext.length - 7) +
      '-' +
      crypto.randomBytes(3).toString('hex') +
      ext;
  }

  return name;
}

/** Per-path-component length cap. Mirrors `sanitizeFilename`'s 255-char
 * basename cap and matches filesystem `NAME_MAX` (255 bytes on Linux/ext4,
 * 255 chars on Windows/NTFS) — without it, `saveBuffer` writes
 * `${file_id}__${flatName}` and a long artifact name surfaces as
 * `ENAMETOOLONG` and falls back to a download URL instead of persisting. */
const ARTIFACT_PATH_SEGMENT_MAX = 255;

/**
 * Truncates a path-leaf segment while preserving its extension, matching the
 * shape `sanitizeFilename` uses for the basename cap. The 6-hex-char
 * suffix disambiguates two long names that would otherwise collapse to the
 * same prefix (e.g. two LLM-generated `report-<huge-prompt-suffix>.csv`).
 *
 * Falls back to whole-segment truncation (no extension preservation) when
 * the extension itself is so long there's no room for a meaningful stem —
 * `path.extname` happily returns 100+ char "extensions" for pathological
 * inputs like `_.<huge-suffix>`, and trying to keep that extension would
 * still blow past the cap.
 */
function truncateLeafSegment(leaf: string): string {
  if (leaf.length <= ARTIFACT_PATH_SEGMENT_MAX) return leaf;
  const ext = path.extname(leaf);
  const stem = path.basename(leaf, ext);
  // 8 = 1 (`-`) + 6 (hex disambiguator) + 1 (minimum 1-char stem)
  if (ext.length > ARTIFACT_PATH_SEGMENT_MAX - 8) {
    return truncateDirSegment(leaf);
  }
  const stemBudget = ARTIFACT_PATH_SEGMENT_MAX - ext.length - 7;
  return stem.slice(0, stemBudget) + '-' + crypto.randomBytes(3).toString('hex') + ext;
}

/** Truncates a non-leaf (directory) segment. Directory segments don't
 * carry semantic extensions, so we just slice and append the same 6-hex
 * disambiguation suffix. */
function truncateDirSegment(seg: string): string {
  if (seg.length <= ARTIFACT_PATH_SEGMENT_MAX) return seg;
  return seg.slice(0, ARTIFACT_PATH_SEGMENT_MAX - 7) + '-' + crypto.randomBytes(3).toString('hex');
}

/**
 * Sanitize a code-execution artifact path while preserving directory components
 * so subsequent prime() runs can place the file at the same nested location in
 * the next sandbox session. Each segment is sanitized independently with the
 * same rules as `sanitizeFilename`. Falls back to the basename for absolute
 * paths or names containing `..` traversal.
 *
 * Each path component is capped at `ARTIFACT_PATH_SEGMENT_MAX` (255) chars
 * — the leaf with extension preservation (matching `sanitizeFilename`),
 * non-leaf segments with a plain truncate-and-disambiguate. Without the
 * cap, long artifact names flow into `saveBuffer`'s storage key
 * unbounded and trip `ENAMETOOLONG` instead of persisting.
 */
export function sanitizeArtifactPath(inputName: string): string {
  if (!inputName) return '_';
  if (path.isAbsolute(inputName)) return sanitizeFilename(inputName);
  const normalized = path.posix.normalize(inputName);
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.endsWith('/..') ||
    normalized.endsWith('/')
  ) {
    return sanitizeFilename(inputName);
  }
  const segments = normalized
    .split('/')
    .map((seg) => seg.replace(/[^a-zA-Z0-9.-]/g, '_'))
    .filter((seg) => seg.length > 0 && seg !== '.');
  if (segments.length === 0) return '_';
  const leafIdx = segments.length - 1;
  if (segments[leafIdx].startsWith('.')) segments[leafIdx] = '_' + segments[leafIdx];
  const capped = segments.map((seg, i) =>
    i === leafIdx ? truncateLeafSegment(seg) : truncateDirSegment(seg),
  );
  return capped.join('/');
}

/**
 * Map a (sanitized) artifact path to a flat storage-safe key. The local
 * storage strategies key by single component; this avoids creating
 * unintended subdirectories on disk while the DB record retains the
 * nested path for the next prime().
 */
export function flattenArtifactPath(safePath: string): string {
  return safePath.replace(/\//g, '__');
}

/**
 * Options for reading files
 */
export interface ReadFileOptions {
  encoding?: BufferEncoding;
  /** Size threshold in bytes. Files larger than this will be streamed. Default: 10MB */
  streamThreshold?: number;
  /** Size of chunks when streaming. Default: 64KB */
  highWaterMark?: number;
  /** File size in bytes if known (e.g. from multer). Avoids extra stat() call. */
  fileSize?: number;
}

/**
 * Result from reading a file
 */
export interface ReadFileResult<T> {
  content: T;
  bytes: number;
}

/**
 * Reads a file asynchronously. Uses streaming for large files to avoid memory issues.
 *
 * @param filePath - Path to the file to read
 * @param options - Options for reading the file
 * @returns Promise resolving to the file contents and size
 * @throws Error if the file cannot be read
 */
export async function readFileAsString(
  filePath: string,
  options: ReadFileOptions = {},
): Promise<ReadFileResult<string>> {
  const {
    encoding = 'utf8',
    streamThreshold = 10 * 1024 * 1024, // 10MB
    highWaterMark = 64 * 1024, // 64KB
    fileSize,
  } = options;

  // Get file size if not provided
  const bytes = fileSize ?? (await stat(filePath)).size;

  // For large files, use streaming to avoid memory issues
  if (bytes > streamThreshold) {
    const chunks: string[] = [];
    const stream = createReadStream(filePath, {
      encoding,
      highWaterMark,
    });

    for await (const chunk of stream) {
      chunks.push(chunk as string);
    }

    return { content: chunks.join(''), bytes };
  }

  // For smaller files, read directly
  const content = await readFile(filePath, encoding);
  return { content, bytes };
}

/**
 * Reads a file as a Buffer asynchronously. Uses streaming for large files.
 *
 * @param filePath - Path to the file to read
 * @param options - Options for reading the file
 * @returns Promise resolving to the file contents and size
 * @throws Error if the file cannot be read
 */
export async function readFileAsBuffer(
  filePath: string,
  options: Omit<ReadFileOptions, 'encoding'> = {},
): Promise<ReadFileResult<Buffer>> {
  const {
    streamThreshold = 10 * 1024 * 1024, // 10MB
    highWaterMark = 64 * 1024, // 64KB
    fileSize,
  } = options;

  // Get file size if not provided
  const bytes = fileSize ?? (await stat(filePath)).size;

  // For large files, use streaming to avoid memory issues
  if (bytes > streamThreshold) {
    const chunks: Buffer[] = [];
    const stream = createReadStream(filePath, {
      highWaterMark,
    });

    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }

    return { content: Buffer.concat(chunks), bytes };
  }

  // For smaller files, read directly
  const content = await readFile(filePath);
  return { content, bytes };
}

/**
 * Reads a JSON file asynchronously
 *
 * @param filePath - Path to the JSON file to read
 * @param options - Options for reading the file
 * @returns Promise resolving to the parsed JSON object
 * @throws Error if the file cannot be read or parsed
 */
export async function readJsonFile<T = unknown>(
  filePath: string,
  options: Omit<ReadFileOptions, 'encoding'> = {},
): Promise<T> {
  const { content } = await readFileAsString(filePath, { ...options, encoding: 'utf8' });
  return JSON.parse(content);
}
