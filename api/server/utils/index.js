console.log("Starting utils")
const streamResponse = require('./streamResponse');
const removePorts = require('./removePorts');
const countTokens = require('./countTokens');
const handleText = require('./handleText');
const citations = require('./citations');
const sendEmail = require('./sendEmail');
const cryptoUtils = require('./crypto');
const queue = require('./queue');
const files = require('./files');
const math = require('./math');
console.log("Logging Modules you should not see undefined:")
console.log({
  streamResponse,
  removePorts,
  countTokens,
  handleText,
  citations,
  sendEmail,
  cryptoUtils,
  queue,
  files,
  math,
});
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
console.log("Exporting utils:", {
  ...streamResponse,
  checkEmailConfig,
  ...cryptoUtils,
  ...handleText,
  ...citations,
  countTokens,
  removePorts,
  sendEmail,
  ...files,
  ...queue,
  math,
});
module.exports = {
  ...streamResponse,
  checkEmailConfig,
  ...cryptoUtils,
  ...handleText,
  ...citations,
  countTokens,
  removePorts,
  sendEmail,
  ...files,
  ...queue,
  math,
};
