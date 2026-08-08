const { logger, tenantStorage } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { createOAuthReconnectionManager, getFlowStateManager } = require('~/config');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { getLogStores } = require('~/cache');
const {
  createMCPRefreshAuthorityLifecycle,
  resolveCurrentMCPToolAuthority,
} = require('./MCPDiscoveryScope');
const { getMCPAuthorityResolver } = require('./MCPAuthority');

/**
 * Initialize OAuth reconnect manager
 */
async function initializeOAuthReconnectManager() {
  try {
    const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
    const tokenMethods = {
      findToken,
      updateToken,
      createToken,
      deleteTokens,
    };
    const resolveAuthority = async (actor, serverName) =>
      await tenantStorage.run({ userId: actor.userId, tenantId: actor.tenantId }, async () => {
        const authority = await resolveCurrentMCPToolAuthority({
          user: actor.user,
          serverName,
          oauthRequiredHint: true,
        });
        if (!authority) {
          return null;
        }
        const parsedConfig = authority.parsedConfig;
        return {
          user: parsedConfig.actor.user,
          serverConfig: parsedConfig.sourceConfig,
          effectiveServerConfig: parsedConfig.effectiveConfig,
          securityPolicy: parsedConfig.securityPolicy,
          customUserVars: parsedConfig.customUserVars,
          oauthAuthorityScope: parsedConfig.catalogScope,
          authorityAuthorizationKind: parsedConfig.authorization.kind,
          refreshAuthorityLifecycle: createMCPRefreshAuthorityLifecycle({ authority }),
          bind: async (action) =>
            await getMCPAuthorityResolver().useIssuedResolution(authority, action),
        };
      });
    await createOAuthReconnectionManager(flowManager, tokenMethods, undefined, resolveAuthority);
    logger.info(`OAuth reconnect manager initialized successfully.`);
  } catch (error) {
    logger.error('Failed to initialize OAuth reconnect manager:', error);
  }
}

module.exports = initializeOAuthReconnectManager;
