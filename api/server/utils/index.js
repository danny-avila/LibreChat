const cryptoUtils = require('./crypto');
const handleText = require('./handleText');
const citations = require('./citations');
const sendEmail = require('./sendEmail');

module.exports = {
  ...cryptoUtils,
  ...handleText,
  ...citations,
  sendEmail,
};
