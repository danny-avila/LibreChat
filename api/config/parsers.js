const { klona } = require('klona');
const winston = require('winston');
const traverse = require('traverse');

const SPLAT_SYMBOL = Symbol.for('splat');
const MESSAGE_SYMBOL = Symbol.for('message');
const CONSOLE_JSON_STRING_LENGTH = parseInt(process.env.CONSOLE_JSON_STRING_LENGTH) || 255;
const DEBUG_MESSAGE_LENGTH = parseInt(process.env.DEBUG_MESSAGE_LENGTH) || 150;

const sensitiveKeys = [
  // OpenAI API key: `sk-` at a word boundary, followed by the documented
  // charset for keys. `\b` keeps `task-runner`, `mask-value`, etc. from
  // being mis-redacted.
  /\b(sk-)[a-zA-Z0-9_-]+/g,
  /\b(Bearer )[^\s"']+/g, // Header: Bearer token pattern
  /\b(api-key:? )[^\s"']+/g, // Header: API key pattern
  /\b(key=)[^\s"'&]+/g, // URL query param: sensitive key pattern (Google)
];

/**
 * Redacts sensitive information from a console message and trims it to a specified length if provided.
 * @param {string} str - The console message to be redacted.
 * @param {number} [trimLength] - The optional length at which to trim the redacted message.
 * @returns {string} - The redacted and optionally trimmed console message.
 */
function redactMessage(str, trimLength) {
  if (!str) {
    return '';
  }

  let redacted = str;
  for (const pattern of sensitiveKeys) {
    redacted = redacted.replace(pattern, '$1[REDACTED]');
  }

  if (trimLength !== undefined && redacted.length > trimLength) {
    return `${redacted.substring(0, trimLength)}...`;
  }

  return redacted;
}

/**
 * Redacts sensitive information from log messages when the log level is
 * `error` or `warn`. Runs on the raw `info.message` before any colorize /
 * splat transforms so the sensitive-token regexes don't have to contend
 * with ANSI escape sequences (whose trailing `m` would otherwise defeat
 * `\b` anchors).
 *
 * Note: Intentionally mutates the object.
 * @param {Object} info - The log information object.
 * @returns {Object} - The modified log information object.
 */
const redactFormat = winston.format((info) => {
  if (info.level === 'error' || info.level === 'warn') {
    if (typeof info.message === 'string') {
      info.message = redactMessage(info.message);
    }
    if (typeof info[MESSAGE_SYMBOL] === 'string') {
      info[MESSAGE_SYMBOL] = redactMessage(info[MESSAGE_SYMBOL]);
    }
  }
  return info;
});

/**
 * Truncates long strings, especially base64 image data, within log messages.
 *
 * @param {any} value - The value to be inspected and potentially truncated.
 * @param {number} [length] - The length at which to truncate the value. Default: 100.
 * @returns {any} - The truncated or original value.
 */
const truncateLongStrings = (value, length = 100) => {
  if (typeof value === 'string') {
    return value.length > length ? value.substring(0, length) + '... [truncated]' : value;
  }

  return value;
};

/**
 * An array mapping function that truncates long strings (objects converted to JSON strings).
 * @param {any} item - The item to be condensed.
 * @returns {any} - The condensed item.
 */
const condenseArray = (item) => {
  if (typeof item === 'string') {
    return truncateLongStrings(JSON.stringify(item));
  } else if (typeof item === 'object') {
    return truncateLongStrings(JSON.stringify(item));
  }
  return item;
};

const RESERVED_LOG_KEYS = new Set(['level', 'message', 'timestamp', 'splat']);

/**
 * Extracts user-supplied metadata from a winston info object, filtering out
 * reserved keys, internal underscore-prefixed keys, and non-serializable values.
 *
 * @param {Record<string, unknown>} source - The object to extract metadata from.
 * @returns {Record<string, unknown> | undefined} - The extracted metadata, or undefined if empty.
 */
function extractMetaObject(source) {
  if (source == null || typeof source !== 'object') {
    return undefined;
  }
  const meta = {};
  for (const key of Object.keys(source)) {
    if (RESERVED_LOG_KEYS.has(key) || key.startsWith('_')) {
      continue;
    }
    /*
     * Skip numeric-index-like keys. When a caller passes a primitive as
     * the second argument to `logger.warn/error`, `format.splat()` can
     * leave character-index keys ("0", "1", ...) on `info`. Those are
     * synthetic splat artifacts, not real metadata, and would otherwise
     * produce noisy output now that warn/error share this path.
     */
    if (/^\d+$/.test(key)) {
      continue;
    }
    const value = source[key];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (typeof value === 'function' || typeof value === 'symbol') {
      continue;
    }
    meta[key] = value;
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Formats the metadata portion of a winston info object as a compact
 * single-line JSON trailer, suitable for appending to the console message.
 * Returns an empty string when there is no meaningful metadata.
 *
 * @param {Record<string, unknown>} info - The winston info object.
 * @returns {string} - The serialized metadata, or an empty string.
 */
function formatConsoleMeta(info) {
  const meta = extractMetaObject(info);
  if (!meta) {
    return '';
  }
  try {
    return JSON.stringify(meta, (_key, value) => {
      if (typeof value !== 'string') {
        return value;
      }
      const safe = redactMessage(value);
      return safe.length > CONSOLE_JSON_STRING_LENGTH
        ? `${safe.substring(0, CONSOLE_JSON_STRING_LENGTH)}...`
        : safe;
    });
  } catch {
    return '';
  }
}

/**
 * Formats log messages for debugging purposes.
 * - Truncates long strings within log messages.
 * - Condenses arrays by truncating long strings and objects as strings within array items.
 * - Redacts sensitive information from log messages if the log level is 'error'.
 * - Converts log information object to a formatted string.
 *
 * @param {Object} options - The options for formatting log messages.
 * @param {string} options.level - The log level.
 * @param {string} options.message - The log message.
 * @param {string} options.timestamp - The timestamp of the log message.
 * @param {Object} options.metadata - Additional metadata associated with the log message.
 * @returns {string} - The formatted log message.
 */
const debugTraverse = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  if (!message) {
    return `${timestamp} ${level}`;
  }

  if (!message?.trim || typeof message !== 'string') {
    return `${timestamp} ${level}: ${JSON.stringify(message)}`;
  }

  let msg = `${timestamp} ${level}: ${truncateLongStrings(message?.trim(), DEBUG_MESSAGE_LENGTH)}`;
  const levelStr = typeof level === 'string' ? level : String(level);
  const isErrorOrWarn = levelStr.includes('error') || levelStr.includes('warn');
  const finalize = (text) => (isErrorOrWarn ? redactMessage(text) : text);
  try {
    if (level !== 'debug' && !isErrorOrWarn) {
      return finalize(msg);
    }

    if (!metadata) {
      return finalize(msg);
    }

    /*
     * Prefer the structured metadata object (which winston merges into info)
     * over `SPLAT_SYMBOL[0]`. For primitive splat values, skip only if the
     * value already appears in the interpolated message (i.e. `%s`/`%d`
     * consumed it) — `logger.warn('failed for %s', tenant)` leaves `tenant`
     * in `SPLAT[0]` after interpolation and would otherwise be appended a
     * second time. Unconsumed primitives like
     * `logger.debug('prefix:', detail)` still surface.
     */
    const extracted = extractMetaObject(metadata);
    const splatFirst = metadata[SPLAT_SYMBOL]?.[0];
    const splatUsable = (() => {
      if (splatFirst == null) {
        return false;
      }
      if (Array.isArray(splatFirst) || typeof splatFirst === 'object') {
        return true;
      }
      if (
        typeof splatFirst === 'string' ||
        typeof splatFirst === 'number' ||
        typeof splatFirst === 'boolean'
      ) {
        const splatStr = String(splatFirst);
        return splatStr !== '' && !message.includes(splatStr);
      }
      return false;
    })();
    const debugValue = extracted ?? (splatUsable ? splatFirst : undefined);

    if (!debugValue) {
      return finalize(msg);
    }

    if (debugValue && Array.isArray(debugValue)) {
      msg += `\n${JSON.stringify(debugValue.map(condenseArray))}`;
      return finalize(msg);
    }

    if (typeof debugValue !== 'object') {
      return finalize((msg += ` ${debugValue}`));
    }

    msg += '\n{';

    /*
     * Traverse the filtered metadata (`debugValue`), not the raw `metadata`
     * object. `extractMetaObject` strips reserved keys, underscore-prefixed
     * internals, and numeric-string splat artifacts — re-reading from raw
     * `metadata` here would put those artifacts back into the output.
     */
    const copy = klona(debugValue);
    traverse(copy).forEach(function (value) {
      if (typeof this?.key === 'symbol') {
        return;
      }

      let _parentKey = '';
      const parent = this.parent;

      if (typeof parent?.key !== 'symbol' && parent?.key) {
        _parentKey = parent.key;
      }

      const parentKey = `${parent && parent.notRoot ? _parentKey + '.' : ''}`;

      const tabs = `${parent && parent.notRoot ? '    ' : '  '}`;

      const currentKey = this?.key ?? 'unknown';

      if (this.isLeaf && typeof value === 'string') {
        const truncatedText = truncateLongStrings(value);
        msg += `\n${tabs}${parentKey}${currentKey}: ${JSON.stringify(truncatedText)},`;
      } else if (this.notLeaf && Array.isArray(value) && value.length > 0) {
        const currentMessage = `\n${tabs}// ${value.length} ${currentKey.replace(/s$/, '')}(s)`;
        this.update(currentMessage, true);
        msg += currentMessage;
        const stringifiedArray = value.map(condenseArray);
        msg += `\n${tabs}${parentKey}${currentKey}: [${stringifiedArray}],`;
      } else if (this.isLeaf && typeof value === 'function') {
        msg += `\n${tabs}${parentKey}${currentKey}: function,`;
      } else if (this.isLeaf) {
        msg += `\n${tabs}${parentKey}${currentKey}: ${value},`;
      }
    });

    msg += '\n}';
    return finalize(msg);
  } catch (e) {
    return finalize((msg += `\n[LOGGER PARSING ERROR] ${e.message}`));
  }
});

const jsonTruncateFormat = winston.format((info) => {
  const truncateLongStrings = (str, maxLength) => {
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  };

  const seen = new WeakSet();

  const truncateObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    // Handle circular references
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);

    if (Array.isArray(obj)) {
      return obj.map((item) => truncateObject(item));
    }

    const newObj = {};
    Object.entries(obj).forEach(([key, value]) => {
      if (typeof value === 'string') {
        newObj[key] = truncateLongStrings(value, CONSOLE_JSON_STRING_LENGTH);
      } else {
        newObj[key] = truncateObject(value);
      }
    });
    return newObj;
  };

  return truncateObject(info);
});

module.exports = {
  redactFormat,
  redactMessage,
  debugTraverse,
  jsonTruncateFormat,
  formatConsoleMeta,
};
