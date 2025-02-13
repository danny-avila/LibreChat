const streamResponse = require('./streamResponse');
const removePorts = require('./removePorts');
const countTokens = require('./countTokens');
const handleText = require('./handleText');
const sendEmail = require('./sendEmail');
const cryptoUtils = require('./crypto');
const queue = require('./queue');
const files = require('./files');
const math = require('./math');
const encryptionUtil = require('./encryptionUtil');

/**
 * Check if email configuration is set
 * @returns {Boolean}
 */
function checkEmailConfig() {
  return (
    (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
    !!process.env.EMAIL_USERNAME &&
    !!process.env.EMAIL_PASSWORD &&
    !!process.env.EMAIL_FROM
  );
}

module.exports = {
  ...streamResponse,
  checkEmailConfig,
  ...cryptoUtils,
  ...handleText,
  ...encryptionUtil,
  countTokens,
  removePorts,
  sendEmail,
  ...files,
  ...queue,
  math,
};
