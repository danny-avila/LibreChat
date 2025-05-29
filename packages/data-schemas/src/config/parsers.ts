import { klona } from 'klona';
import winston from 'winston';
import traverse from 'traverse';

const SPLAT_SYMBOL = Symbol.for('splat');
const MESSAGE_SYMBOL = Symbol.for('message');
const CONSOLE_JSON_STRING_LENGTH: number =
  parseInt(process.env.CONSOLE_JSON_STRING_LENGTH || '', 10) || 255;

const sensitiveKeys: RegExp[] = [
  /^(sk-)[^\s]+/, // OpenAI API key pattern
  /(Bearer )[^\s]+/, // Header: Bearer token pattern
  /(api-key:? )[^\s]+/, // Header: API key pattern
  /(key=)[^\s]+/, // URL query param: sensitive key pattern (Google)
];

/**
 * Determines if a given value string is sensitive and returns matching regex patterns.
 *
 * @param valueStr - The value string to check.
 * @returns An array of regex patterns that match the value string.
 */
function getMatchingSensitivePatterns(valueStr: string): RegExp[] {
  if (valueStr) {
    // Filter and return all regex patterns that match the value string
    return sensitiveKeys.filter((regex) => regex.test(valueStr));
  }
  return [];
}

/**
 * Redacts sensitive information from a console message and trims it to a specified length if provided.
 * @param str - The console message to be redacted.
 * @param trimLength - The optional length at which to trim the redacted message.
 * @returns The redacted and optionally trimmed console message.
 */
function redactMessage(str: string, trimLength?: number): string {
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
 * @param info - The log information object.
 * @returns The modified log information object.
 */
const redactFormat = winston.format((info: winston.Logform.TransformableInfo) => {
  if (info.level === 'error') {
    info.message = redactMessage(info.message);
    if (info[MESSAGE_SYMBOL]) {
      info[MESSAGE_SYMBOL] = redactMessage(info[MESSAGE_SYMBOL]);
    }
  }
  return info;
});

/**
 * Truncates long strings, especially base64 image data, within log messages.
 *
 * @param value - The value to be inspected and potentially truncated.
 * @param length - The length at which to truncate the value. Default: 100.
 * @returns The truncated or original value.
 */
const truncateLongStrings = (value: any, length = 100): any => {
  if (typeof value === 'string') {
    return value.length > length ? value.substring(0, length) + '... [truncated]' : value;
  }

  return value;
};

/**
 * An array mapping function that truncates long strings (objects converted to JSON strings).
 * @param item - The item to be condensed.
 * @returns The condensed item.
 */
const condenseArray = (item: any): any => {
  if (typeof item === 'string') {
    return truncateLongStrings(JSON.stringify(item));
  } else if (typeof item === 'object') {
    return truncateLongStrings(JSON.stringify(item));
  }
  return item;
};

/**
 * Formats log messages for debugging purposes.
 * - Truncates long strings within log messages.
 * - Condenses arrays by truncating long strings and objects as strings within array items.
 * - Redacts sensitive information from log messages if the log level is 'error'.
 * - Converts log information object to a formatted string.
 *
 * @param options - The options for formatting log messages.
 * @returns The formatted log message.
 */
const debugTraverse = winston.format.printf(
  ({ level, message, timestamp, ...metadata }: Record<string, any>) => {
    if (!message) {
      return `${timestamp} ${level}`;
    }

    if (!message?.trim || typeof message !== 'string') {
      return `${timestamp} ${level}: ${JSON.stringify(message)}`;
    }

    let msg = `${timestamp} ${level}: ${truncateLongStrings(message.trim(), 150)}`;

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

      if (Array.isArray(debugValue)) {
        msg += `\n${JSON.stringify(debugValue.map(condenseArray))}`;
        return msg;
      }

      if (typeof debugValue !== 'object') {
        return `${msg} ${debugValue}`;
      }

      msg += '\n{';

      const copy = klona(metadata);

      traverse(copy).forEach(function (this: any, value: any) {
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
      return msg;
    } catch (e: any) {
      return `${msg}\n[LOGGER PARSING ERROR] ${e.message}`;
    }
  },
);

/**
 * Truncates long string values in JSON log objects.
 * Prevents outputting extremely long values (e.g., base64, blobs).
 */
const jsonTruncateFormat = winston.format((info: any) => {
  const truncateLongStrings = (str: string, maxLength: number): string =>
    str.length > maxLength ? str.substring(0, maxLength) + '...' : str;

  const seen = new WeakSet();

  const truncateObject = (obj: any): any => {
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

    const newObj: Record<string, any> = {};
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

export { redactFormat, redactMessage, debugTraverse, jsonTruncateFormat };
