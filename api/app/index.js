const { browserClient } = require('./chatgpt-browser');
const { askBing } = require('./bingai');
const clients = require('./clients');
const titleConvo = require('./titleConvo');
const titleConvoBing = require('./titleConvoBing');
const getCitations = require('../lib/parse/getCitations');
const citeText = require('../lib/parse/citeText');

module.exports = {
  browserClient,
  askBing,
  titleConvo,
  titleConvoBing,
  getCitations,
  citeText,
  ...clients
};
