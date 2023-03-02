const { askClient } = require('./chatgpt-client');
const { browserClient } = require('./chatgpt-browser');
const { askBing } = require('./bingai');
const titleConvo = require('./titleConvo');
const detectCode = require('./detectCode');

module.exports = {
  askClient,
  browserClient,
  askBing,
  titleConvo,
  detectCode
};