const avatar = require('./avatar');
const convert = require('./convert');
const parse = require('./parse');
const resize = require('./resize');

module.exports = {
  ...convert,
  ...parse,
  ...resize,
  avatar,
};
