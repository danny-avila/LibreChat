const { logger } = require('@librechat/data-schemas');

const DEFAULT_IMPORT_MAX_FILE_SIZE = 262144000; // 250 MiB

function resolveImportMaxFileSize() {
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

module.exports = { DEFAULT_IMPORT_MAX_FILE_SIZE, resolveImportMaxFileSize };
