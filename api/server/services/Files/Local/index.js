const images = require('./images');
const files = require('./files');
const crud = require('./crud');

module.exports = {
  ...crud,
  ...images,
  ...files,
};
