const convert = require('./convert');
const encode = require('./encode');
const resize = require('./resize');
const validate = require('./validate');
const uploadAvatar = require('./avatar/uploadAvatar');

module.exports = {
  ...convert,
  ...encode,
  ...resize,
  ...validate,
  uploadAvatar,
};
