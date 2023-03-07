const { askClient } = require('./chatgpt-client');
const { browserClient } = require('./chatgpt-browser');
const customClient = require('./chatgpt-custom');
const { askBing } = require('./bingai');
const titleConvo = require('./titleConvo');
const detectCode = require('./detectCode');

module.exports = {
  askClient,
  browserClient,
  customClient,
  askBing,
  titleConvo,
  detectCode
};