const crud = require('./crud');
const initialize = require('./initialize');

module.exports = {
  ...crud,
  ...initialize,
};
