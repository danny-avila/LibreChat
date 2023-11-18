const localStrategy = require('./localStrategy');
const convert = require('./convert');
const save = require('./save');

module.exports = {
  ...save,
  ...convert,
  localStrategy,
};
