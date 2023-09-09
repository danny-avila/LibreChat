const uap = require('ua-parser-js');
const { handleError } = require('../utils');
const { logViolation } = require('../../cache');

async function uaParser(req, res, next) {
  const ua = uap(req.headers['user-agent']);

  if (!ua.browser.name) {
    const type = 'non_browser';
    await logViolation(req, type, { type }, 20);
    return handleError(res, { message: 'Illegal request' });
  }
  next();
}

module.exports = uaParser;
