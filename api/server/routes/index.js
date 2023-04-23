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
const { localAuth, googleAuth, facebookAuth } = require('./oauth');

module.exports = {
  search,
  ask,
  messages,
  convos,
  presets,
  prompts,
  auth,
  localAuth,
  googleAuth,
  facebookAuth,
  tokenizer,
  me,
  endpoints,
  authenticatedOr401,
  authenticatedOrRedirect
};
