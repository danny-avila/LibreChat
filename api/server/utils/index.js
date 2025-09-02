const removePorts = require('./removePorts');
const countTokens = require('./countTokens');
const handleText = require('./handleText');
const sendEmail = require('./sendEmail');
const queue = require('./queue');
const files = require('./files');

module.exports = {
  ...handleText,
  countTokens,
  removePorts,
  sendEmail,
  ...files,
  ...queue,
};
