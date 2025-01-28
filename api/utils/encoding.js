const base64url = require('base64url');

/**
 * Convert a base64url string to a Buffer.
 * @param {string} baseurlStr - The base64url string.
 * @returns {Buffer}
 */
function base64urlToBuffer(baseurlStr) {
  return Buffer.from(base64url.toBuffer(baseurlStr));
}

/**
 * Convert a Buffer to a base64url string.
 * @param {Buffer} buffer - The Buffer to convert.
 * @returns {string}
 */
function bufferToBase64url(buffer) {
  return base64url(buffer);
}

module.exports = {
  base64urlToBuffer,
  bufferToBase64url,
};