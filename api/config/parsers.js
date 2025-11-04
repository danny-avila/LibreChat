const { klona } = require('klona');
const winston = require('winston');
const traverse = require('traverse');

const SPLAT_SYMBOL = Symbol.for('splat');
const MESSAGE_SYMBOL = Symbol.for('message');
const CONSOLE_JSON_STRING_LENGTH = parseInt(process.env.CONSOLE_JSON_STRING_LENGTH) || 255;

const sensitiveKeys = [
  /^(sk-)[^\s]+/, // OpenAI API key pattern
  /(Bearer )[^\s]+/, // Header: Bearer token pattern
  /(api-key:? )[^\s]+/, // Header: API key pattern
  /(key=)[^\s]+/, // URL query param: sensitive key pattern (Google)
];

/**
 * Determines if a given value string is sensitive and returns matching regex patterns.
 *
 * @param {string} valueStr - The value string to check.
 * @returns {Array<RegExp>} An array of regex patterns that match the value string.
 */
function getMatchingSensitivePatterns(valueStr) {
  if (valueStr) {
    // Filter and return all regex patterns that match the value string
    return sensitiveKeys.filter((regex) => regex.test(valueStr));
  }
  return [];
}

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

  const patterns = getMatchingSensitivePatterns(str);
  patterns.forEach((pattern) => {
    str = str.replace(pattern, '$1[REDACTED]');
  });

  if (trimLength !== undefined && str.length > trimLength) {
    return `${str.substring(0, trimLength)}...`;
  }

  return str;
}

/**
 * Redacts sensitive information from log messages if the log level is 'error'.
 * Note: Intentionally mutates the object.
 * @param {Object} info - The log information object.
 * @returns {Object} - The modified log information object.
 */
const redactFormat = winston.format((info) => {
  if (info.level === 'error') {
    info.message = redactMessage(info.message);
    if (info[MESSAGE_SYMBOL]) {
      info[MESSAGE_SYMBOL] = redactMessage(info[MESSAGE_SYMBOL]);
    }
  }
  return info;
});

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

  let msg = `${timestamp} ${level}: ${message?.trim()}`;
  try {
    if (level !== 'debug') {
      return msg;
    }

    if (!metadata) {
      return msg;
    }

    const debugValue = metadata[SPLAT_SYMBOL]?.[0];

    if (!debugValue) {
      return msg;
    }

    if (debugValue && Array.isArray(debugValue)) {
      msg += `\n${JSON.stringify(debugValue)}`;
      return msg;
    }

    if (typeof debugValue !== 'object') {
      return (msg += ` ${debugValue}`);
    }

    msg += '\n{';

    const copy = klona(metadata);
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
        msg += `\n${tabs}${parentKey}${currentKey}: ${JSON.stringify(value)},`;
      } else if (this.notLeaf && Array.isArray(value) && value.length > 0) {
        const currentMessage = `\n${tabs}// ${value.length} ${currentKey.replace(/s$/, '')}(s)`;
        this.update(currentMessage, true);
        msg += currentMessage;
        msg += `\n${tabs}${parentKey}${currentKey}: ${JSON.stringify(value)},`;
      } else if (this.isLeaf && typeof value === 'function') {
        msg += `\n${tabs}${parentKey}${currentKey}: function,`;
      } else if (this.isLeaf) {
        msg += `\n${tabs}${parentKey}${currentKey}: ${value},`;
      }
    });

    msg += '\n}';
    return msg;
  } catch (e) {
    return (msg += `\n[LOGGER PARSING ERROR] ${e.message}`);
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
};
