const { askClient } = require('./clients/chatgpt-client');
const { browserClient } = require('./clients/chatgpt-browser');
const { askBing } = require('./clients/bingai');
const clients = require('./clients/classes');
const titleConvo = require('./titleConvo');
const getCitations = require('../lib/parse/getCitations');
const citeText = require('../lib/parse/citeText');

module.exports = {
  askClient,
  browserClient,
  askBing,
  titleConvo,
  getCitations,
  citeText,
  ...clients
};
