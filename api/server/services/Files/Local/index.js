const images = require('./images');
const crud = require('./crud');

module.exports = {
  ...crud,
  ...images,
};
