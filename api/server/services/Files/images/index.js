const avatar = require('./avatar');
const encode = require('./encode');
const parse = require('./parse');
const resize = require('./resize');
const validate = require('./validate');

module.exports = {
  ...encode,
  ...parse,
  ...resize,
  ...validate,
  avatar,
};
