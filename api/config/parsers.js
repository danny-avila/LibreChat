const util = require('util');
const winston = require('winston');
const traverse = require('traverse');
const { klona } = require('klona/full');

const MESSAGE_SYMBOL = Symbol.for('message');

const sensitiveKeys = [/^(sk-)[^\s]+/, /(Bearer )[^\s]+/, /(api-key:? )[^\s]+/, /(key=)[^\s]+/];

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
 * Recursively redacts sensitive information from an object.
 *
 * @param {object} obj - The object to traverse and redact.
 */
function redactObject(obj) {
  traverse(obj).forEach((node) => {
    if (typeof node !== 'object' || Array.isArray(node)) {
      return;
    }

    if (!node.level) {
      return;
    }

    if (node.level !== 'error') {
      return;
    }

    const messagePatterns = getMatchingSensitivePatterns(node.message);

    if (node[MESSAGE_SYMBOL]) {
      const symbolMessagePatterns = getMatchingSensitivePatterns(node[MESSAGE_SYMBOL]);
      symbolMessagePatterns.forEach((pattern) => {
        node[MESSAGE_SYMBOL] = node[MESSAGE_SYMBOL].replace(pattern, '$1[REDACTED]');
      });
    }

    if (messagePatterns.length === 0) {
      return;
    }

    messagePatterns.forEach((pattern) => {
      node.message = node.message.replace(pattern, '$1[REDACTED]');
    });

    return;
  });
}

/**
 * Redacts sensitive information from a console message.
 *
 * @param {string} str - The console message to be redacted.
 * @returns {string} - The redacted console message.
 */
function redactConsoleMessage(str) {
  const patterns = getMatchingSensitivePatterns(str);

  if (patterns.length === 0) {
    return str;
  }

  patterns.forEach((pattern) => {
    str = str.replace(pattern, '$1[REDACTED]');
  });

  return str;
}

/**
 * Deep copies and redacts sensitive information from an object.
 *
 * @param {object} obj - The object to copy and redact.
 * @returns {object} The redacted copy of the original object.
 */
function redact(obj) {
  const copy = klona(obj); // Making a deep copy to prevent side effects
  redactObject(copy);

  const splat = copy[Symbol.for('splat')];
  redactObject(splat); // Specifically redact splat Symbol

  return copy;
}

/**
 * Truncates long strings, especially base64 image data, within log messages.
 *
 * @param {any} value - The value to be inspected and potentially truncated.
 * @returns {any} - The truncated or original value.
 */
const truncateLongStrings = (value) => {
  if (typeof value === 'string') {
    return value.length > 100 ? value.substring(0, 100) + '... [truncated]' : value;
  }

  return value;
};

// /**
//  * Processes each message in the messages array, specifically looking for and truncating
//  * base64 image URLs in the content. If a base64 image URL is found, it replaces the URL
//  * with a truncated message.
//  *
//  * @param {PayloadMessage} message - The payload message object to format.
//  * @returns {PayloadMessage} - The processed message object with base64 image URLs truncated.
//  */
// const truncateBase64ImageURLs = (message) => {
//   // Create a deep copy of the message
//   const messageCopy = JSON.parse(JSON.stringify(message));

//   if (messageCopy.content && Array.isArray(messageCopy.content)) {
//     messageCopy.content = messageCopy.content.map(contentItem => {
//       if (contentItem.type === 'image_url' && contentItem.image_url && isBase64String(contentItem.image_url.url)) {
//         return { ...contentItem, image_url: { ...contentItem.image_url, url: 'Base64 Image Data... [truncated]' } };
//       }
//       return contentItem;
//     });
//   }
//   return messageCopy;
// };

// /**
//  * Checks if a string is a base64 image data string.
//  *
//  * @param {string} str - The string to be checked.
//  * @returns {boolean} - True if the string is base64 image data, otherwise false.
//  */
// const isBase64String = (str) => /^data:image\/[a-zA-Z]+;base64,/.test(str);

/**
 * Custom log format for Winston that handles deep object inspection.
 * It specifically truncates long strings and handles nested structures within metadata.
 *
 * @param {Object} info - Information about the log entry.
 * @returns {string} - The formatted log message.
 */
const deepObjectFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} ${level}: ${message}`;

  if (Object.keys(metadata).length) {
    Object.entries(metadata).forEach(([key, value]) => {
      let val = value;
      if (key === 'modelOptions' && value && Array.isArray(value.messages)) {
        // Create a shallow copy of the messages array
        // val = { ...value, messages: value.messages.map(truncateBase64ImageURLs) };
        val = { ...value, messages: `${value.messages.length} message(s) in payload` };
      }
      // Inspects each metadata value; applies special handling for 'messages'
      const inspectedValue =
        typeof val === 'string'
          ? truncateLongStrings(val)
          : util.inspect(val, { depth: null, colors: false }); // Use 'val' here
      msg += ` ${key}: ${inspectedValue}`;
    });
  }

  return msg;
});

const redactErrors = winston.format((info) => {
  if (info.level === 'error') {
    return redact(info);
  }
  return info;
});

module.exports = {
  redactErrors,
  redactConsoleMessage,
  deepObjectFormat,
};
