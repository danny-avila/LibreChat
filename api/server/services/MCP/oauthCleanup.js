const { logger, getTenantId } = require('@librechat/data-schemas');
const { MCPOAuthHandler, MCPTokenStorage, isOAuthServer } = require('@librechat/api');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { getFlowStateManager, getMCPServersRegistry } = require('~/config');
const { getLogStores } = require('~/cache');
const db = require('~/models');

/** Best-effort cleanup of stored MCP OAuth tokens and flow state. */
const clearStoredMCPOAuthState = async (userId, serverName, skipOAuthFlows = false) => {
  try {
    await MCPTokenStorage.deleteUserTokens({
      userId,
      serverName,
      deleteToken: async (filter) => db.deleteTokens(filter),
    });
  } catch (error) {
    logger.warn(
      `[clearStoredMCPOAuthState] Failed to delete MCP OAuth tokens for ${serverName}:`,
      error,
    );
  }

  try {
    const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
    const tenantId = getTenantId();
    const baseFlowId = MCPOAuthHandler.generateFlowId(userId, serverName);
    const flowDeletes = [
      [MCPOAuthHandler.generateTokenFlowId(userId, serverName, tenantId), 'mcp_get_tokens'],
      [baseFlowId, 'mcp_get_tokens'],
      ...(!skipOAuthFlows
        ? [
            [MCPOAuthHandler.generateFlowId(userId, serverName, tenantId), 'mcp_oauth'],
            [baseFlowId, 'mcp_oauth'],
          ]
        : []),
    ].filter(
      ([flowId, type], index, deletes) =>
        deletes.findIndex(
          ([candidateId, candidateType]) => candidateId === flowId && candidateType === type,
        ) === index,
    );
    const results = await Promise.allSettled(
      flowDeletes.map(([flowId, type]) =>
        type === 'mcp_oauth'
          ? MCPOAuthHandler.deleteFlowAndStateMapping(flowId, flowManager)
          : flowManager.deleteFlow(flowId, type),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(
          `[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for ${serverName}:`,
          result.reason,
        );
      }
    }
  } catch (error) {
    logger.warn(
      `[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for ${serverName}:`,
      error,
    );
  }
};

/** Revokes MCP OAuth tokens at the provider when possible, then clears local state. */
const maybeUninstallOAuthMCP = async (userId, pluginKey, appConfig, serverConfigOverride) => {
  if (!pluginKey.startsWith(Constants.mcp_prefix)) {
    return;
  }

  const serverName = pluginKey.replace(Constants.mcp_prefix, '');
  try {
    const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
    const flowIds = [
      MCPOAuthHandler.generateFlowId(userId, serverName, getTenantId()),
      MCPOAuthHandler.generateFlowId(userId, serverName),
    ];
    const results = await Promise.allSettled(
      [...new Set(flowIds)].map((flowId) =>
        MCPOAuthHandler.deleteFlowAndStateMapping(flowId, flowManager),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.warn(
          `[clearStoredMCPOAuthState] Failed to clear MCP OAuth flow state for ${serverName}:`,
          result.reason,
        );
      }
    }
  } catch (error) {
    logger.warn(
      `[maybeUninstallOAuthMCP] Failed to disable callback state for ${serverName}:`,
      error,
    );
  }

  const registry = getMCPServersRegistry();
  const serverConfig =
    serverConfigOverride ??
    (await registry.getServerConfig(serverName, userId)) ??
    appConfig?.mcpServers?.[serverName];
  const oauthServer = serverConfigOverride
    ? isOAuthServer(serverConfigOverride)
    : (await registry.getOAuthServers(userId)).has(serverName);
  if (!oauthServer || !serverConfig) {
    await clearStoredMCPOAuthState(userId, serverName, true);
    return;
  }

  let clientTokenData;
  try {
    clientTokenData = await MCPTokenStorage.getClientInfoAndMetadata({
      userId,
      serverName,
      findToken: db.findToken,
    });
  } catch (error) {
    logger.warn(
      `[maybeUninstallOAuthMCP] Unable to load OAuth client metadata for ${serverName}; clearing local MCP OAuth state only.`,
      error,
    );
    await clearStoredMCPOAuthState(userId, serverName, true);
    return;
  }
  if (clientTokenData == null) {
    await clearStoredMCPOAuthState(userId, serverName, true);
    return;
  }

  const { clientInfo, clientMetadata } = clientTokenData;
  const storedServerUrl = clientMetadata.server_url;
  const storedClientSource = clientMetadata.client_source;
  if (
    typeof storedServerUrl !== 'string' ||
    typeof clientMetadata.token_endpoint !== 'string' ||
    typeof clientMetadata.revocation_endpoint !== 'string' ||
    typeof clientMetadata.credential_set_id !== 'string' ||
    (storedClientSource !== 'configured' && storedClientSource !== 'dynamic')
  ) {
    logger.warn(
      `[maybeUninstallOAuthMCP] Stored binding is incomplete for ${serverName}; clearing local state.`,
    );
    await clearStoredMCPOAuthState(userId, serverName, true);
    return;
  }

  let tokens;
  try {
    tokens = await MCPTokenStorage.getTokens({ userId, serverName, findToken: db.findToken });
    if (tokens) {
      MCPTokenStorage.assertCredentialSetBinding(
        serverName,
        tokens.credential_set_id,
        clientMetadata,
      );
    }
  } catch (error) {
    tokens = null;
    logger.warn(
      `[maybeUninstallOAuthMCP] Unable to load OAuth tokens for ${serverName}; clearing local token state.`,
      error,
    );
  }

  const revocationMetadata = {
    serverUrl: storedServerUrl,
    clientId: clientInfo.client_id,
    clientSecret: clientInfo.client_secret ?? '',
    revocationEndpoint: clientMetadata.revocation_endpoint,
    revocationEndpointAuthMethodsSupported:
      clientMetadata.revocation_endpoint_auth_methods_supported,
  };
  const oauthHeaders = serverConfig.oauth_headers ?? {};
  const allowedDomains = appConfig?.mcpSettings?.allowedDomains;
  const allowedAddresses = appConfig?.mcpSettings?.allowedAddresses;
  for (const [tokenType, token] of [
    ['access', tokens?.access_token],
    ['refresh', tokens?.refresh_token],
  ]) {
    if (!token) {
      continue;
    }
    try {
      await MCPOAuthHandler.revokeOAuthToken(
        serverName,
        token,
        tokenType,
        revocationMetadata,
        oauthHeaders,
        allowedDomains,
        allowedAddresses,
      );
    } catch (error) {
      logger.error(`[maybeUninstallOAuthMCP] Error revoking ${tokenType} token:`, error);
    }
  }

  await clearStoredMCPOAuthState(userId, serverName, true);
};

module.exports = { clearStoredMCPOAuthState, maybeUninstallOAuthMCP };
