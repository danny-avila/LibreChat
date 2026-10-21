const { createChannelsRouter, createChannelContext, isEnabled } = require('@librechat/api');
const { createChannelStore, logger } = require('@librechat/data-schemas');
const mongoose = require('mongoose');
const { requireJwtAuth, requireTermsAcceptance, checkBan } = require('~/server/middleware');
const { checkRemoteAgentsFeature, checkAgentPermission } = require('./agents/middleware');
const { OpenAIChatCompletionController } = require('~/server/controllers/agents/openai');
const { loadCustomConfig } = require('~/server/services/Config');
const { strictConfigMiddleware } = require('~/server/middleware/config/app');
const { createOpenIDSessionTokenProvider } = require('~/server/services/OpenIDSessionRefresh');
const db = require('~/models');

module.exports = createChannelsRouter({
  store: createChannelStore(mongoose),
  loadConfig: loadCustomConfig.bind(null, false),
  env: process.env,
  browserAuth: requireJwtAuth,
  terms: requireTermsAcceptance,
  checkBan,
  configMiddleware: strictConfigMiddleware,
  checkFeature: checkRemoteAgentsFeature,
  checkAgent: checkAgentPermission,
  context: createChannelContext({
    createOpenIDSessionTokenProvider,
    reuseOpenIDTokens: isEnabled(process.env.OPENID_REUSE_TOKENS),
  }),
  execute: OpenAIChatCompletionController,
  findUser: db.findUser,
  isPrincipalActive: db.isAgentTriggerPrincipalActive,
  reportError: logger.warn.bind(logger),
});
