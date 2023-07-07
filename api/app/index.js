const { browserClient } = require('./chatgpt-browser');
const { askBing } = require('./bingai');
const clients = require('./clients');
const titleConvo = require('./titleConvo');
const getCitations = require('../lib/parse/getCitations');
const citeText = require('../lib/parse/citeText');

module.exports = {
  browserClient,
  askBing,
  titleConvo,
  getCitations,
  citeText,
  ...clients
};
