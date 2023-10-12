const uap = require('ua-parser-js');
const { handleError } = require('../utils');
const { logViolation } = require('../../cache');

/**
 * Middleware to parse User-Agent header and check if it's from a recognized browser.
 * If the User-Agent is not recognized as a browser, logs a violation and sends an error response.
 *
 * @function
 * @async
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 * @returns {void} Sends an error response if the User-Agent is not recognized as a browser.
 *
 * @example
 * app.use(uaParser);
 */
async function uaParser(req, res, next) {
  const { NON_BROWSER_VIOLATION_SCORE: score = 20 } = process.env;
  const ua = uap(req.headers['user-agent']);

  if (!ua.browser.name) {
    const type = 'non_browser';
    await logViolation(req, res, type, { type }, score);
    return handleError(res, { message: 'Illegal request' });
  }
  next();
}

module.exports = uaParser;
