const localStrategy = require('./localStrategy');
const process = require('./process');
const save = require('./save');

module.exports = {
  ...save,
  ...process,
  localStrategy,
};
