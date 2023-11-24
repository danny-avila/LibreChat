const convert = require('./convert');
const encode = require('./encode');
const resize = require('./resize');
const validate = require('./validate');

module.exports = {
  ...convert,
  ...encode,
  ...resize,
  ...validate,
};
