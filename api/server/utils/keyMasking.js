/**
 * Utility functions for masking sensitive information like API keys
 * Prevents accidental exposure in logs, error messages, and responses
 */

/**
 * Masks an API key, showing only the first few and last few characters
 * @param {string} key - The API key to mask
 * @param {Object} options - Masking options
 * @param {number} options.showFirst - Number of characters to show at start (default: 3)
 * @param {number} options.showLast - Number of characters to show at end (default: 4)
 * @param {string} options.mask - Character to use for masking (default: '*')
 * @returns {string} The masked key or '[REDACTED]' if key is invalid
 */
function maskAPIKey(key, options = {}) {
  // Handle null, undefined, or empty strings
  if (!key || typeof key !== 'string') {
    return '[REDACTED]';
  }

  const { showFirst = 3, showLast = 4, mask = '*' } = options;

  // If key is too short to mask meaningfully, fully redact it
  if (key.length <= showFirst + showLast) {
    return '[REDACTED]';
  }

  const firstPart = key.substring(0, showFirst);
  const lastPart = key.substring(key.length - showLast);
  const maskLength = Math.max(key.length - showFirst - showLast, 8);
  const maskedPart = mask.repeat(maskLength);

  return `${firstPart}${maskedPart}${lastPart}`;
}

/**
 * Masks multiple API keys in an object
 * @param {Object} obj - Object potentially containing API keys
 * @param {Array<string>} keyPatterns - Array of key names/patterns to mask
 * @returns {Object} New object with masked keys
 */
function maskObjectKeys(obj, keyPatterns = []) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Default patterns for common API key field names
  const defaultPatterns = [
    /api[_-]?key/i,
    /api[_-]?secret/i,
    /secret[_-]?key/i,
    /auth[_-]?token/i,
    /access[_-]?token/i,
    /bearer/i,
    /password/i,
    /pwd/i,
    /pass/i,
    /credential/i,
    /private[_-]?key/i,
  ];

  const patterns = [...defaultPatterns, ...keyPatterns.map(p => new RegExp(p, 'i'))];

  // Deep clone the object to avoid mutations
  const masked = JSON.parse(JSON.stringify(obj));

  function maskRecursive(target) {
    for (const key in target) {
      if (!target.hasOwnProperty(key)) continue;

      // Check if this key should be masked
      const shouldMask = patterns.some(pattern => pattern.test(key));

      if (shouldMask && typeof target[key] === 'string') {
        target[key] = maskAPIKey(target[key]);
      } else if (typeof target[key] === 'object' && target[key] !== null) {
        maskRecursive(target[key]);
      }
    }
  }

  maskRecursive(masked);
  return masked;
}

/**
 * Safely logs an object, automatically masking sensitive fields
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Log message
 * @param {Object} data - Data to log (will be masked)
 * @param {Object} logger - Logger instance (defaults to console)
 */
function safeLog(level, message, data, logger = console) {
  const maskedData = maskObjectKeys(data);

  if (logger[level]) {
    logger[level](message, maskedData);
  } else {
    console[level](message, maskedData);
  }
}

/**
 * Creates a safe error that masks sensitive information
 * @param {string} message - Error message
 * @param {Object} details - Additional error details (will be masked)
 * @returns {Error} Error with masked details
 */
function createSafeError(message, details = {}) {
  const error = new Error(message);
  error.details = maskObjectKeys(details);
  return error;
}

/**
 * Validates if a string looks like an API key format
 * @param {string} key - String to check
 * @returns {boolean} True if it matches common API key patterns
 */
function looksLikeAPIKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // Common API key patterns
  const patterns = [
    /^sk-[a-zA-Z0-9]{20,}$/,           // OpenAI style
    /^pk_[a-zA-Z0-9]{20,}$/,           // Stripe style
    /^sk-or-v\d-[a-zA-Z0-9]{20,}$/,   // OpenRouter style
    /^[a-f0-9]{32,}$/i,                // Hex string (common for API keys)
    /^[A-Za-z0-9+/]{40,}={0,2}$/,     // Base64 encoded
    /^Bearer\s+[a-zA-Z0-9\-._~+/]+=*$/i, // Bearer token
  ];

  return patterns.some(pattern => pattern.test(key));
}

/**
 * Sanitizes error objects before logging or sending to client
 * @param {Error} error - Error to sanitize
 * @returns {Object} Sanitized error object
 */
function sanitizeError(error) {
  const sanitized = {
    message: error.message,
    name: error.name,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  };

  // Check if error message might contain sensitive data
  if (looksLikeAPIKey(error.message)) {
    sanitized.message = 'An error occurred with authentication';
  }

  // Mask any additional properties
  if (error.details) {
    sanitized.details = maskObjectKeys(error.details);
  }

  // Remove any properties that might contain sensitive data
  const sensitiveProps = ['config', 'request', 'response', 'apiKey', 'api_key', 'authorization'];
  sensitiveProps.forEach(prop => {
    if (error[prop]) {
      sanitized[prop] = '[REDACTED]';
    }
  });

  return sanitized;
}

module.exports = {
  maskAPIKey,
  maskObjectKeys,
  safeLog,
  createSafeError,
  looksLikeAPIKey,
  sanitizeError,
};