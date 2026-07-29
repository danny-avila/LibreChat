import { logger } from '@librechat/data-schemas';

const UNSUPPORTED_IMPORT_TYPE = 'Unsupported import type';
const ARCHIVE_TOO_LARGE_MESSAGE = 'The uploaded archive exceeds the allowed size limits';
const FILE_TOO_LARGE_MESSAGE =
  'This JSON file is too large to import on its own. Compress it into a .zip and upload that instead';
const ARCHIVE_CORRUPT_MESSAGE = 'The uploaded archive is corrupt or could not be read';
const STORAGE_FAILURE_MESSAGE = 'A storage error occurred while processing the import';
const IMPORT_FAILED_MESSAGE = 'The import could not be completed';

/** Node `fs` error codes that indicate a local storage failure (disk
 * pressure, permissions, a file removed out from under a read). Every one
 * of these embeds the server's absolute filesystem path in `.message`. */
const FS_ERROR_CODES = new Set([
  'ENOENT',
  'EACCES',
  'EPERM',
  'EISDIR',
  'ENOTDIR',
  'ENOSPC',
  'EMFILE',
  'ENFILE',
  'EBUSY',
  'ELOOP',
  'ENAMETOOLONG',
  'EROFS',
  'EEXIST',
  'EIO',
]);

const CORRUPT_ARCHIVE_PATTERN =
  /invalid relative path|absolute path|traversal|central directory|not a valid zip|unable to read archive|entry not found in archive|unable to read entry/i;

/**
 * A bare (un-zipped) upload larger than the per-entry cap. Distinct from
 * `ZipBombError` because it is not a bomb and not the user's mistake: the
 * upload limit is sized for a `.zip`, whose shards are each well under the
 * cap, so this file passed every check before the one that can reject it.
 * The message it maps to therefore names the workaround.
 */
export class ImportFileTooLargeError extends Error {
  readonly code = 'IMPORT_FILE_TOO_LARGE';
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileTooLargeError';
  }
}

function errorCode(error: Error): string | undefined {
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Classifies a raw import failure into one of a small set of stable,
 * non-revealing messages before it is stored on a job record or returned
 * to a client. Node's `fs` errors (`ENOENT`, `EACCES`, ...) embed the
 * server's absolute upload path in `.message`, and a raw `ZipBombError`
 * or archive-parsing error can embed attacker-controlled entry names;
 * none of that detail is ever forwarded. The original error is logged
 * here, server-side, and only here — callers should not also log it.
 */
export function sanitizeImportError(error: unknown, context: string): string {
  const normalized = error instanceof Error ? error : new Error(String(error));
  logger.error(`[import] ${context}`, normalized);

  const code = errorCode(normalized);
  if (code === 'IMPORT_FILE_TOO_LARGE') {
    return FILE_TOO_LARGE_MESSAGE;
  }
  if (code === 'ZIP_BOMB') {
    return ARCHIVE_TOO_LARGE_MESSAGE;
  }
  if (normalized.message === UNSUPPORTED_IMPORT_TYPE) {
    return UNSUPPORTED_IMPORT_TYPE;
  }
  if (code !== undefined && FS_ERROR_CODES.has(code)) {
    return STORAGE_FAILURE_MESSAGE;
  }
  if (normalized instanceof SyntaxError || CORRUPT_ARCHIVE_PATTERN.test(normalized.message)) {
    return ARCHIVE_CORRUPT_MESSAGE;
  }
  return IMPORT_FAILED_MESSAGE;
}
