const formatMessages = require('./formatMessages');
const summaryPrompts = require('./summaryPrompts');
const handleInputs = require('./handleInputs');
const instructions = require('./instructions');
const titlePrompts = require('./titlePrompts');
const truncateText = require('./truncateText');

module.exports = {
  ...formatMessages,
  ...summaryPrompts,
  ...handleInputs,
  ...instructions,
  ...titlePrompts,
  truncateText,
};
