import { logger } from '@librechat/data-schemas';

/** 1 GiB — default max file size for conversation imports */
export const DEFAULT_IMPORT_MAX_FILE_SIZE = 1073741824;

/** Resolves the import file-size limit from the env var, falling back to the 1 GiB default */
export function resolveImportMaxFileSize(): number {
  const raw = process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES;
  if (!raw) {
    return DEFAULT_IMPORT_MAX_FILE_SIZE;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(
      `[imports] Invalid CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES="${raw}"; using default ${DEFAULT_IMPORT_MAX_FILE_SIZE}`,
    );
    return DEFAULT_IMPORT_MAX_FILE_SIZE;
  }
  return parsed;
}
