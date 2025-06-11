const streamResponse = require('./streamResponse');
const removePorts = require('./removePorts');
const countTokens = require('./countTokens');
const handleText = require('./handleText');
const sendEmail = require('./sendEmail');
const cryptoUtils = require('./crypto');
const queue = require('./queue');
const files = require('./files');
const math = require('./math');

/**
 * Check if email configuration is set
 * @returns {Boolean}
 */
function checkEmailConfig() {
  // Check if Mailgun is configured
  const hasMailgunConfig =
    !!process.env.MAILGUN_API_KEY && !!process.env.MAILGUN_DOMAIN && !!process.env.EMAIL_FROM;

  // Check if SMTP is configured
  const hasSMTPConfig =
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
    !!process.env.EMAIL_USERNAME &&
    !!process.env.EMAIL_PASSWORD &&
    !!process.env.EMAIL_FROM;

  // Return true if either Mailgun or SMTP is properly configured
  return hasMailgunConfig || hasSMTPConfig;
}

module.exports = {
  ...streamResponse,
  checkEmailConfig,
  ...cryptoUtils,
  ...handleText,
  countTokens,
  removePorts,
  sendEmail,
  ...files,
  ...queue,
  math,
};
