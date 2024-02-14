const avatar = require('./avatar');
const convert = require('./convert');
const encode = require('./encode');
const parse = require('./parse');
const resize = require('./resize');

module.exports = {
  ...convert,
  ...encode,
  ...parse,
  ...resize,
  avatar,
};
