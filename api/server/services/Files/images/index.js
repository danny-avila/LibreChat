const avatar = require('./avatar');
const convert = require('./convert');
const encode = require('./encode');
const parse = require('./parse');
const resize = require('./resize');
const validate = require('./validate');

module.exports = {
  ...convert,
  ...encode,
  ...parse,
  ...resize,
  ...validate,
  avatar,
};
