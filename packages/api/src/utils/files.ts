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
 * Deterministic disambiguator suffix for truncated names. The original
 * `sanitizeFilename` used `crypto.randomBytes(3)`, which made the
 * truncated form non-deterministic — a re-upload of the same long
 * filename would compute a *different* storage key, orphaning the
 * previous on-disk file under `claimCodeFile`'s reused `file_id`.
 *
 * Hashing the input gives stability across calls (same input → same
 * output) while still disambiguating distinct inputs that share a
 * truncation prefix. SHA-256 truncated to 6 hex chars is collision-safe
 * for our scale (24 bits ≈ 16M values; we'd need ~5K simultaneous
 * truncated names in one (filename, conversationId) bucket before a
 * collision becomes likely, vs. the realistic ceiling of single-digit
 * artifacts per turn).
 */
function deterministicHexSuffix(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 6);
}

/**
 * Truncates a path-leaf segment while preserving its extension, matching the
 * shape `sanitizeFilename` uses for the basename cap. The 6-hex-char
 * suffix is a SHA-256 prefix of the original input, so re-truncating
 * the same name produces the same key (no orphaned uploads).
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
  return stem.slice(0, stemBudget) + '-' + deterministicHexSuffix(leaf) + ext;
}

/** Truncates a non-leaf (directory) segment. Directory segments don't
 * carry semantic extensions, so we just slice and append the same 6-hex
 * disambiguation suffix. */
function truncateDirSegment(seg: string): string {
  if (seg.length <= ARTIFACT_PATH_SEGMENT_MAX) return seg;
  return seg.slice(0, ARTIFACT_PATH_SEGMENT_MAX - 7) + '-' + deterministicHexSuffix(seg);
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

/** Limit on `path.extname`'s "extension" length we'll honor when
 * truncating a flat key. Real file extensions cap out around 8 chars
 * (`.parquet`, `.tsv`, `.html`); a 16-char ceiling keeps us tolerant of
 * legitimate edge cases (`.openshift`) while ignoring pathological
 * outputs from `path.extname` on contrived inputs. Above that we treat
 * the trailing `.foo` as part of the stem and just hard-truncate. */
const FLAT_KEY_MAX_EXT_LENGTH = 16;

/**
 * Map a (sanitized) artifact path to a flat storage-safe key. The local
 * storage strategies key by single component; this avoids creating
 * unintended subdirectories on disk while the DB record retains the
 * nested path for the next prime().
 *
 * Optionally caps the result at `maxLength` characters. Per-segment caps
 * applied by `sanitizeArtifactPath` aren't enough on their own —
 * `${file_id}__${flatName}` has to fit in one filesystem path component
 * (NAME_MAX = 255 on most filesystems), so a deeply-nested path whose
 * segments are individually within bounds can still produce a flat form
 * that overflows once `${file_id}__` is prepended. The caller passes
 * `255 - prefix.length` and the truncation preserves the leaf extension
 * with the same disambiguating hex suffix that `sanitizeFilename` uses.
 *
 * Without this cap, oversized flat keys hit `ENAMETOOLONG` inside
 * `saveBuffer`, the artifact falls back to a download URL, and the next
 * prime() never sees it.
 */
export function flattenArtifactPath(safePath: string, maxLength?: number): string {
  const flat = safePath.replace(/\//g, '__');
  if (maxLength == null || flat.length <= maxLength) return flat;
  if (maxLength <= 0) return '';

  /* Find the leaf's extension (last `.`) — segment separators are `__`,
   * never `.`, so the last dot is always inside the leaf. Ignore
   * "extensions" longer than `FLAT_KEY_MAX_EXT_LENGTH` so a pathological
   * input doesn't leave us with no stem budget. */
  const lastDot = flat.lastIndexOf('.');
  const candidateExt = lastDot >= 0 ? flat.slice(lastDot) : '';
  const ext =
    candidateExt.length > 0 && candidateExt.length <= FLAT_KEY_MAX_EXT_LENGTH ? candidateExt : '';
  const stem = ext ? flat.slice(0, lastDot) : flat;
  // 7 = '-' + 6 hex disambiguator. Stem budget can collapse to 0 when
  // `ext.length > maxLength - 7` — that's fine; the stem just disappears
  // and we fall back to `-<hash><ext>` (still bounded). The hash is a
  // SHA-256 prefix of `safePath` so re-flattening the same input
  // produces the same key (same storage location across re-uploads).
  const stemBudget = Math.max(0, maxLength - ext.length - 7);
  const truncated = stem.slice(0, stemBudget) + '-' + deterministicHexSuffix(safePath) + ext;
  /* Final clamp. The stemBudget formula above keeps `truncated.length`
   * exactly at `maxLength` for any maxLength ≥ ext.length + 7, and at
   * `7 + ext.length` otherwise. The latter can still exceed maxLength
   * for absurdly small budgets (maxLength < ext.length + 7) — clamp
   * defensively so callers always get a key ≤ maxLength regardless of
   * what they passed in. */
  return truncated.length <= maxLength ? truncated : truncated.slice(0, maxLength);
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
