const convert = require('./convert');
const encode = require('./encode');
const resize = require('./resize');
const validate = require('./validate');
const firebase = require('./firebase');
const avatarCreate = require('./avatarCreate');

module.exports = {
  ...convert,
  ...encode,
  ...resize,
  ...validate,
  ...firebase,
  ...avatarCreate,
};
