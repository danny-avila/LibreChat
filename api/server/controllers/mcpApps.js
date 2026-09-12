const path = require('path');
const { logger, getTenantId } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { createAuthIdentityContext, createMCPAppsController } = require('@librechat/api');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { getAppConfig } = require('~/server/services/Config');
const { resolveConfigServers } = require('~/server/services/MCP');
const { createOpenIDSessionTokenProvider } = require('~/server/services/OpenIDSessionRefresh');
const {
  findPluginAuthsByKeys,
  findToken,
  createToken,
  updateToken,
  deleteTokens,
} = require('~/models');
const { getLogStores } = require('~/cache');

module.exports = createMCPAppsController({
  logger,
  sandboxPath: path.resolve(__dirname, '../../../client/public/mcp-sandbox.html'),
  getManager: getMCPManager,
  getFlowManager: () => getFlowStateManager(getLogStores(CacheKeys.FLOWS)),
  getAppConfig: (req) =>
    getAppConfig({
      role: req.user?.role,
      userId: req.user?.id,
      tenantId: req.user?.tenantId,
    }),
  resolveConfigServers: (req) => resolveConfigServers(req, { throwOnError: true }),
  findPluginAuthsByKeys,
  tokenMethods: { findToken, createToken, updateToken, deleteTokens },
  createUpstreamTokenProvider: (req, res, user) =>
    createOpenIDSessionTokenProvider({
      req,
      res,
      user,
      identityContext: createAuthIdentityContext({ user, tenantId: getTenantId() }),
      tokenPreference: 'access_token',
    }),
});
