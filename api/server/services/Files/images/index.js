const convert = require('./convert');
const encode = require('./encode');
const resize = require('./resize');
const validate = require('./validate');
const firebase = require('./avatar/firebase');
const uploadAvatar = require('./avatar/avatarCreate');

module.exports = {
  ...convert,
  ...encode,
  ...resize,
  ...validate,
  ...firebase,
  uploadAvatar,
};
