const { askClient } = require('./clients/chatgpt-client');
const { browserClient } = require('./clients/chatgpt-browser');
const { askBing } = require('./clients/bingai');
const { askSydney } = require('./clients/sydney');
const customClient = require('./clients/chatgpt-custom');
const titleConvo = require('./titleConvo');
const getCitations = require('../lib/parse/getCitations');
const citeText = require('../lib/parse/citeText');
const detectCode = require('../lib/parse/detectCode');

module.exports = {
  askClient,
  browserClient,
  customClient,
  askBing,
  askSydney,
  titleConvo,
  getCitations,
  citeText,
  detectCode
};