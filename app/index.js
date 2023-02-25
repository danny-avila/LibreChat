const { titleConvo } = require('./chatgpt');
const { askClient } = require('./chatgpt-client');
const { askBing } = require('./bingai');

module.exports = {
  titleConvo,
  askClient,
  askBing,
};