const encode = require('./encode');
const parse = require('./parse');
const resize = require('./resize');
const validate = require('./validate');
const uploadAvatar = require('./avatar/uploadAvatar');

module.exports = {
  ...encode,
  ...parse,
  ...resize,
  ...validate,
  uploadAvatar,
};
