const formatMessage = require('./formatMessage');
const refinePrompts = require('./refinePrompts');
const handleInputs = require('./handleInputs');
const instructions = require('./instructions');
const titlePrompts = require('./titlePrompts');
const truncateText = require('./truncateText');

module.exports = {
  formatMessage,
  ...refinePrompts,
  ...handleInputs,
  ...instructions,
  ...titlePrompts,
  truncateText,
};
