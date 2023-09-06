const instructions = require('./instructions');
const titlePrompts = require('./titlePrompts');
const refinePrompts = require('./refinePrompts');

module.exports = {
  ...refinePrompts,
  ...instructions,
  ...titlePrompts,
};
