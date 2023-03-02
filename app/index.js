const titleConvo = require('./titleConvo');
const { askClient } = require('./chatgpt-client');
const { browserClient } = require('./chatgpt-browser');
const { askBing } = require('./bingai');

module.exports = {
  titleConvo,
  askClient,
  askBing,
  browserClient,
};