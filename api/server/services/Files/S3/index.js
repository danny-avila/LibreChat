const crud = require('./crud');
const images = require('./images');
const initialize = require('./initialize');

module.exports = {
  ...crud,
  ...images,
  ...initialize,
};
