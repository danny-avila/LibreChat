const ask = require('./ask');
const messages = require('./messages');
const convos = require('./convos');
const presets = require('./presets');
const prompts = require('./prompts');
const search = require('./search');
const tokenizer = require('./tokenizer');
const me = require('./me');
const { router: endpoints } = require('./endpoints');
const { router: auth, authenticatedOr401, authenticatedOrRedirect } = require('./auth');

module.exports = {
  search,
  ask,
  messages,
  convos,
  presets,
  prompts,
  auth,
  tokenizer,
  me,
  endpoints,
  authenticatedOr401,
  authenticatedOrRedirect
};
