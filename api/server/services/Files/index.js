const localStrategy = require('./localStrategy');
const save = require('./save');

module.exports = {
  ...save,
  localStrategy,
};
