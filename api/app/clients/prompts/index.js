const formatMessages = require('./formatMessages');
const refinePrompts = require('./refinePrompts');
const handleInputs = require('./handleInputs');
const instructions = require('./instructions');
const titlePrompts = require('./titlePrompts');
const truncateText = require('./truncateText');

module.exports = {
  ...formatMessages,
  ...refinePrompts,
  ...handleInputs,
  ...instructions,
  ...titlePrompts,
  truncateText,
};
