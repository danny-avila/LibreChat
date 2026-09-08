const { logger } = require('@librechat/data-schemas');

/** Upstream default for every Code API request (`/exec`, `/upload`, `/download`). */
const DEFAULT_CODE_API_TIMEOUT_MS = 15_000;

let warnedValue;

/**
 * Request timeout for Code API calls, from `LIBRECHAT_CODE_TIMEOUT_MS`.
 *
 * Unset keeps the 15 s default. A deployment whose sandbox needs longer to start or to
 * stage session files before a call returns can raise it; the value should stay below any
 * proxy timeout on the path, which would otherwise cut the request first. A value that is
 * not a positive integer falls back to the default and is logged once per distinct value,
 * so a typo does not silently change behavior. Read per call so tests (and a config
 * reload) see the current env.
 *
 * @returns {number} Timeout in milliseconds.
 */
function getCodeApiTimeoutMs() {
  const raw = process.env.LIBRECHAT_CODE_TIMEOUT_MS?.trim();
  if (raw == null || raw === '') {
    return DEFAULT_CODE_API_TIMEOUT_MS;
  }
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    if (warnedValue !== raw) {
      warnedValue = raw;
      logger.warn(
        `[CodeAPI] LIBRECHAT_CODE_TIMEOUT_MS=${raw} is not a positive integer; using the default of ${DEFAULT_CODE_API_TIMEOUT_MS} ms`,
      );
    }
    return DEFAULT_CODE_API_TIMEOUT_MS;
  }
  return Number(raw);
}

module.exports = { getCodeApiTimeoutMs, DEFAULT_CODE_API_TIMEOUT_MS };
