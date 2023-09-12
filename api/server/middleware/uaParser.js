const uap = require('ua-parser-js');
const { handleError } = require('../utils');
const { logViolation } = require('../../cache');

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
