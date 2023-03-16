const ask = require('./ask');
const messages = require('./messages');
const convos = require('./convos');
const customGpts = require('./customGpts');
const prompts = require('./prompts'); 
const search = require('./search');
const { router: auth, authenticatedOr401, authenticatedOrRedirect } = require('./auth');

module.exports = { search, ask, messages, convos, customGpts, prompts, auth, authenticatedOr401, authenticatedOrRedirect };