const convert = require('./convert');
const encode = require('./encode');
const parse = require('./parse');
const resize = require('./resize');
const validate = require('./validate');
const uploadAvatar = require('./avatar/uploadAvatar');

module.exports = {
  ...convert,
  ...encode,
  ...parse,
  ...resize,
  ...validate,
  uploadAvatar,
};
