const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { createOAuthReconnectionManager, getFlowStateManager } = require('~/config');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { getLogStores } = require('~/cache');
const { resolveCurrentMCPToolAuthority } = require('./MCPDiscoveryScope');
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
    const resolveAuthority = async (userId, serverName) => {
      const authority = await resolveCurrentMCPToolAuthority({
        user: { id: userId },
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
        customUserVars: parsedConfig.customUserVars,
        oauthAuthorityScope: parsedConfig.catalogScope,
        bind: async (action) =>
          await getMCPAuthorityResolver().useIssuedResolution(authority, action),
      };
    };
    await createOAuthReconnectionManager(flowManager, tokenMethods, undefined, resolveAuthority);
    logger.info(`OAuth reconnect manager initialized successfully.`);
  } catch (error) {
    logger.error('Failed to initialize OAuth reconnect manager:', error);
  }
}

module.exports = initializeOAuthReconnectManager;
