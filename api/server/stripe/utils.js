const { logger } = require('@librechat/data-schemas');
const UNREDACTED_HEADERS = process.env.UNREDACTED_HEADERS;

let unredactedHeaders = [];
if (UNREDACTED_HEADERS) {
  unredactedHeaders = UNREDACTED_HEADERS.split(',')
    .map(name => name.trim().toLowerCase())
    .filter(name => name.length > 0);
}
/**
 * Redacts header value by default, unless it is in the UNREDACTED_HEADERS list
 * @param {*} headerName The name of the header
 * @param {*} headerValue The value of the header
 * @returns 
 */
function redactValue(headerName, headerValue) {
  if (!headerName || !headerValue) return '';
  
  if (unredactedHeaders.length > 0) {
    if (unredactedHeaders.includes(headerName.toLowerCase())) {
      return headerValue;
    }
  } else {
    logger.info('[Stripe:redactValue] No unredacted headers found, redacting header');
  }
  
  return `[REDACTED ${headerValue.length} CHARACTERS]`;
}

module.exports = {
  redactValue,
};