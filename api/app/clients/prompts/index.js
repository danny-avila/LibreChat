const instructions = require('./instructions');
const titlePrompts = require('./titlePrompts');
const refinePrompts = require('./refinePrompts');
const truncateText = require('./truncateText');

module.exports = {
  ...refinePrompts,
  ...instructions,
  ...titlePrompts,
  truncateText,
};
