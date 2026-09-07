const crud = require('./crud');
const images = require('./images');
const serveImage = require('./serveImage');

module.exports = {
  ...crud,
  ...images,
  ...serveImage,
};
