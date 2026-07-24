const handleText = require('./handleText');
const sendEmail = require('./sendEmail');
const queue = require('./queue');
const files = require('./files');
const getLanguageName = require('./getLanguageName');

module.exports = {
  ...handleText,
  sendEmail,
  ...files,
  ...queue,
  getLanguageName,
};
