const { browserClient } = require('./chatgpt-browser');
const { askBing } = require('./bingai');
const clients = require('./clients');
const titleConvo = require('./titleConvo');
const titleConvoBing = require('./titleConvoBing');

module.exports = {
  browserClient,
  askBing,
  titleConvo,
  titleConvoBing,
  ...clients,
};
