const { Router } = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  CacheKeys,
  Constants,
  PermissionBits,
  PermissionTypes,
  Permissions,
} = require('librechat-data-provider');
const {
  getBasePath,
  createSafeUser,
  MCPOAuthHandler,
  MCPTokenStorage,
  setOAuthSession,
  getUserMCPAuthMap,
  validateOAuthCsrf,
  OAUTH_CSRF_COOKIE,
  setOAuthCsrfCookie,
  generateCheckAccess,
  validateOAuthSession,
  OAUTH_SESSION_COOKIE,
} = require('@librechat/api');
const {
  createMCPServerController,
  updateMCPServerController,
  deleteMCPServerController,
  getMCPServersList,
  getMCPServerById,
  getMCPTools,
} = require('~/server/controllers/mcp');
const {
  getOAuthReconnectionManager,
  getMCPServersRegistry,
  getFlowStateManager,
  getMCPManager,
} = require('~/config');
const { getMCPSetupData, getServerConnectionStatus } = require('~/server/services/MCP');
const { requireJwtAuth, canAccessMCPServerResource } = require('~/server/middleware');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { updateMCPServerTools } = require('~/server/services/Config/mcp');
const { reinitMCPServer } = require('~/server/services/Tools/mcp');
const { getLogStores } = require('~/cache');
const db = require('~/models');

const router = Router();

const OAUTH_CSRF_COOKIE_PATH = '/api/mcp';

/**
 * Get all MCP tools available to the user
 * Returns only MCP tools, completely decoupled from regular LibreChat tools
 */
router.get('/tools', requireJwtAuth, async (req, res) => {
  return getMCPTools(req, res);
});

/**
 * Initiate OAuth flow
 * This endpoint is called when the user clicks the auth link in the UI
 */
router.get('/:serverName/oauth/initiate', requireJwtAuth, setOAuthSession, async (req, res) => {
  try {
    const { serverName } = req.params;
    const { userId, flowId } = req.query;
    const user = req.user;

    // Verify the userId matches the authenticated user
    if (userId !== user.id) {
      return res.status(403).json({ error: 'User mismatch' });
    }

    logger.debug('[MCP OAuth] Initiate request', { serverName, userId, flowId });

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    /** Flow state to retrieve OAuth config */
    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (!flowState) {
      logger.error('[MCP OAuth] Flow state not found', { flowId });
      return res.status(404).json({ error: 'Flow not found' });
    }

    const { serverUrl, oauth: oauthConfig } = flowState.metadata || {};
    if (!serverUrl || !oauthConfig) {
      logger.error('[MCP OAuth] Missing server URL or OAuth config in flow state');
      return res.status(400).json({ error: 'Invalid flow state' });
    }

    const oauthHeaders = await getOAuthHeaders(serverName, userId);
    const { authorizationUrl, flowId: oauthFlowId } = await MCPOAuthHandler.initiateOAuthFlow(
      serverName,
      serverUrl,
      userId,
      oauthHeaders,
      oauthConfig,
    );

    logger.debug('[MCP OAuth] OAuth flow initiated', { oauthFlowId, authorizationUrl });

    setOAuthCsrfCookie(res, oauthFlowId, OAUTH_CSRF_COOKIE_PATH);
    res.redirect(authorizationUrl);
  } catch (error) {
    logger.error('[MCP OAuth] Failed to initiate OAuth', error);
    res.status(500).json({ error: 'Failed to initiate OAuth' });
  }
});

/**
 * OAuth callback handler
 * This handles the OAuth callback after the user has authorized the application
 */
router.get('/:serverName/oauth/callback', async (req, res) => {
  const basePath = getBasePath();
  try {
    const { serverName } = req.params;
    const { code, state, error: oauthError } = req.query;

    logger.debug('[MCP OAuth] Callback received', {
      serverName,
      code: code ? 'present' : 'missing',
      state,
      error: oauthError,
    });

    if (oauthError) {
      logger.error('[MCP OAuth] OAuth error received', { error: oauthError });
      return res.redirect(
        `${basePath}/oauth/error?error=${encodeURIComponent(String(oauthError))}`,
      );
    }

    if (!code || typeof code !== 'string') {
      logger.error('[MCP OAuth] Missing or invalid code');
      return res.redirect(`${basePath}/oauth/error?error=missing_code`);
    }

    if (!state || typeof state !== 'string') {
      logger.error('[MCP OAuth] Missing or invalid state');
      return res.redirect(`${basePath}/oauth/error?error=missing_state`);
    }

    const flowId = state;
    logger.debug('[MCP OAuth] Using flow ID from state', { flowId });

    const flowParts = flowId.split(':');
    if (flowParts.length < 2 || !flowParts[0] || !flowParts[1]) {
      logger.error('[MCP OAuth] Invalid flow ID format in state', { flowId });
      return res.redirect(`${basePath}/oauth/error?error=invalid_state`);
    }

    const [flowUserId] = flowParts;
    if (
      !validateOAuthCsrf(req, res, flowId, OAUTH_CSRF_COOKIE_PATH) &&
      !validateOAuthSession(req, flowUserId)
    ) {
      logger.error('[MCP OAuth] CSRF validation failed: no valid CSRF or session cookie', {
        flowId,
        hasCsrfCookie: !!req.cookies?.[OAUTH_CSRF_COOKIE],
        hasSessionCookie: !!req.cookies?.[OAUTH_SESSION_COOKIE],
      });
      return res.redirect(`${basePath}/oauth/error?error=csrf_validation_failed`);
    }

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    logger.debug('[MCP OAuth] Getting flow state for flowId: ' + flowId);
    const flowState = await MCPOAuthHandler.getFlowState(flowId, flowManager);

    if (!flowState) {
      logger.error('[MCP OAuth] Flow state not found for flowId:', flowId);
      return res.redirect(`${basePath}/oauth/error?error=invalid_state`);
    }

    logger.debug('[MCP OAuth] Flow state details', {
      serverName: flowState.serverName,
      userId: flowState.userId,
      hasMetadata: !!flowState.metadata,
      hasClientInfo: !!flowState.clientInfo,
      hasCodeVerifier: !!flowState.codeVerifier,
    });

    /** Check if this flow has already been completed (idempotency protection) */
    const currentFlowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (currentFlowState?.status === 'COMPLETED') {
      logger.warn('[MCP OAuth] Flow already completed, preventing duplicate token exchange', {
        flowId,
        serverName,
      });
      return res.redirect(`${basePath}/oauth/success?serverName=${encodeURIComponent(serverName)}`);
    }

    logger.debug('[MCP OAuth] Completing OAuth flow');
    const oauthHeaders = await getOAuthHeaders(serverName, flowState.userId);
    const tokens = await MCPOAuthHandler.completeOAuthFlow(flowId, code, flowManager, oauthHeaders);
    logger.info('[MCP OAuth] OAuth flow completed, tokens received in callback route');

    /** Persist tokens immediately so reconnection uses fresh credentials */
    if (flowState?.userId && tokens) {
      try {
        await MCPTokenStorage.storeTokens({
          userId: flowState.userId,
          serverName,
          tokens,
          createToken: db.createToken,
          updateToken: db.updateToken,
          findToken: db.findToken,
          clientInfo: flowState.clientInfo,
          metadata: flowState.metadata,
        });
        logger.debug('[MCP OAuth] Stored OAuth tokens prior to reconnection', {
          serverName,
          userId: flowState.userId,
        });
      } catch (error) {
        logger.error('[MCP OAuth] Failed to store OAuth tokens after callback', error);
        throw error;
      }

      /**
       * Clear any cached `mcp_get_tokens` flow result so subsequent lookups
       * re-fetch the freshly stored credentials instead of returning stale nulls.
       */
      if (typeof flowManager?.deleteFlow === 'function') {
        try {
          await flowManager.deleteFlow(flowId, 'mcp_get_tokens');
        } catch (error) {
          logger.warn('[MCP OAuth] Failed to clear cached token flow state', error);
        }
      }
    }

    try {
      const mcpManager = getMCPManager(flowState.userId);
      logger.debug(`[MCP OAuth] Attempting to reconnect ${serverName} with new OAuth tokens`);

      if (flowState.userId !== 'system') {
        const user = { id: flowState.userId };

        const userConnection = await mcpManager.getUserConnection({
          user,
          serverName,
          flowManager,
          tokenMethods: {
            findToken: db.findToken,
            updateToken: db.updateToken,
            createToken: db.createToken,
            deleteTokens: db.deleteTokens,
          },
        });

        logger.info(
          `[MCP OAuth] Successfully reconnected ${serverName} for user ${flowState.userId}`,
        );

        // clear any reconnection attempts
        const oauthReconnectionManager = getOAuthReconnectionManager();
        oauthReconnectionManager.clearReconnection(flowState.userId, serverName);

        const tools = await userConnection.fetchTools();
        await updateMCPServerTools({
          userId: flowState.userId,
          serverName,
          tools,
        });
      } else {
        logger.debug(`[MCP OAuth] System-level OAuth completed for ${serverName}`);
      }
    } catch (error) {
      logger.warn(
        `[MCP OAuth] Failed to reconnect ${serverName} after OAuth, but tokens are saved:`,
        error,
      );
    }

    /** ID of the flow that the tool/connection is waiting for */
    const toolFlowId = flowState.metadata?.toolFlowId;
    if (toolFlowId) {
      logger.debug('[MCP OAuth] Completing tool flow', { toolFlowId });
      await flowManager.completeFlow(toolFlowId, 'mcp_oauth', tokens);
    }

    /** Redirect to success page with flowId and serverName */
    const redirectUrl = `${basePath}/oauth/success?serverName=${encodeURIComponent(serverName)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('[MCP OAuth] OAuth callback error', error);
    res.redirect(`${basePath}/oauth/error?error=callback_failed`);
  }
});

/**
 * Get OAuth tokens for a completed flow
 * This is primarily for user-level OAuth flows
 */
router.get('/oauth/tokens/:flowId', requireJwtAuth, async (req, res) => {
  try {
    const { flowId } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!flowId.startsWith(`${user.id}:`) && !flowId.startsWith('system:')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (!flowState) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    if (flowState.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Flow not completed' });
    }

    res.json({ tokens: flowState.result });
  } catch (error) {
    logger.error('[MCP OAuth] Failed to get tokens', error);
    res.status(500).json({ error: 'Failed to get tokens' });
  }
});

/**
 * Set CSRF binding cookie for OAuth flows initiated outside of HTTP request/response
 * (e.g. during chat via SSE). The frontend should call this before opening the OAuth URL
 * so the callback can verify the browser matches the flow initiator.
 */
router.post('/:serverName/oauth/bind', requireJwtAuth, setOAuthSession, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);
    setOAuthCsrfCookie(res, flowId, OAUTH_CSRF_COOKIE_PATH);

    res.json({ success: true });
  } catch (error) {
    logger.error('[MCP OAuth] Failed to set CSRF binding cookie', error);
    res.status(500).json({ error: 'Failed to bind OAuth flow' });
  }
});

/**
 * Check OAuth flow status
 * This endpoint can be used to poll the status of an OAuth flow
 */
router.get('/oauth/status/:flowId', requireJwtAuth, async (req, res) => {
  try {
    const { flowId } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!flowId.startsWith(`${user.id}:`) && !flowId.startsWith('system:')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
    if (!flowState) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    res.json({
      status: flowState.status,
      completed: flowState.status === 'COMPLETED',
      failed: flowState.status === 'FAILED',
      error: flowState.error,
    });
  } catch (error) {
    logger.error('[MCP OAuth] Failed to get flow status', error);
    res.status(500).json({ error: 'Failed to get flow status' });
  }
});

/**
 * Cancel OAuth flow
 * This endpoint cancels a pending OAuth flow
 */
router.post('/oauth/cancel/:serverName', requireJwtAuth, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info(`[MCP OAuth Cancel] Cancelling OAuth flow for ${serverName} by user ${user.id}`);

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);
    const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);
    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');

    if (!flowState) {
      logger.debug(`[MCP OAuth Cancel] No active flow found for ${serverName}`);
      return res.json({
        success: true,
        message: 'No active OAuth flow to cancel',
      });
    }

    await flowManager.failFlow(flowId, 'mcp_oauth', 'User cancelled OAuth flow');

    logger.info(`[MCP OAuth Cancel] Successfully cancelled OAuth flow for ${serverName}`);

    res.json({
      success: true,
      message: `OAuth flow for ${serverName} cancelled successfully`,
    });
  } catch (error) {
    logger.error('[MCP OAuth Cancel] Failed to cancel OAuth flow', error);
    res.status(500).json({ error: 'Failed to cancel OAuth flow' });
  }
});

/**
 * Reinitialize MCP server
 * This endpoint allows reinitializing a specific MCP server
 */
router.post('/:serverName/reinitialize', requireJwtAuth, setOAuthSession, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = createSafeUser(req.user);

    if (!user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info(`[MCP Reinitialize] Reinitializing server: ${serverName}`);

    const mcpManager = getMCPManager();
    const serverConfig = await getMCPServersRegistry().getServerConfig(serverName, user.id);
    if (!serverConfig) {
      return res.status(404).json({
        error: `MCP server '${serverName}' not found in configuration`,
      });
    }

    await mcpManager.disconnectUserConnection(user.id, serverName);
    logger.info(
      `[MCP Reinitialize] Disconnected existing user connection for server: ${serverName}`,
    );

    /** @type {Record<string, Record<string, string>> | undefined} */
    let userMCPAuthMap;
    if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
      userMCPAuthMap = await getUserMCPAuthMap({
        userId: user.id,
        servers: [serverName],
        findPluginAuthsByKeys: db.findPluginAuthsByKeys,
      });
    }

    const result = await reinitMCPServer({
      user,
      serverName,
      userMCPAuthMap,
    });

    if (!result) {
      return res.status(500).json({ error: 'Failed to reinitialize MCP server for user' });
    }

    const { success, message, oauthRequired, oauthUrl } = result;

    if (oauthRequired) {
      const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);
      setOAuthCsrfCookie(res, flowId, OAUTH_CSRF_COOKIE_PATH);
    }

    res.json({
      success,
      message,
      oauthUrl,
      serverName,
      oauthRequired,
    });
  } catch (error) {
    logger.error('[MCP Reinitialize] Unexpected error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Get connection status for all MCP servers
 * This endpoint returns all app level and user-scoped connection statuses from MCPManager without disconnecting idle connections
 */
router.get('/connection/status', requireJwtAuth, async (req, res) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { mcpConfig, appConnections, userConnections, oauthServers } = await getMCPSetupData(
      user.id,
    );
    const connectionStatus = {};

    for (const [serverName, config] of Object.entries(mcpConfig)) {
      try {
        connectionStatus[serverName] = await getServerConnectionStatus(
          user.id,
          serverName,
          config,
          appConnections,
          userConnections,
          oauthServers,
        );
      } catch (error) {
        const message = `Failed to get status for server "${serverName}"`;
        logger.error(`[MCP Connection Status] ${message},`, error);
        connectionStatus[serverName] = {
          connectionState: 'error',
          requiresOAuth: oauthServers.has(serverName),
          error: message,
        };
      }
    }

    res.json({
      success: true,
      connectionStatus,
    });
  } catch (error) {
    if (error.message === 'MCP config not found') {
      return res.status(404).json({ error: error.message });
    }
    logger.error('[MCP Connection Status] Failed to get connection status', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

/**
 * Get connection status for a single MCP server
 * This endpoint returns the connection status for a specific server for a given user
 */
router.get('/connection/status/:serverName', requireJwtAuth, async (req, res) => {
  try {
    const user = req.user;
    const { serverName } = req.params;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { mcpConfig, appConnections, userConnections, oauthServers } = await getMCPSetupData(
      user.id,
    );

    if (!mcpConfig[serverName]) {
      return res
        .status(404)
        .json({ error: `MCP server '${serverName}' not found in configuration` });
    }

    const serverStatus = await getServerConnectionStatus(
      user.id,
      serverName,
      mcpConfig[serverName],
      appConnections,
      userConnections,
      oauthServers,
    );

    res.json({
      success: true,
      serverName,
      connectionStatus: serverStatus.connectionState,
      requiresOAuth: serverStatus.requiresOAuth,
    });
  } catch (error) {
    if (error.message === 'MCP config not found') {
      return res.status(404).json({ error: error.message });
    }
    logger.error(
      `[MCP Per-Server Status] Failed to get connection status for ${req.params.serverName}`,
      error,
    );
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

/**
 * Check which authentication values exist for a specific MCP server
 * This endpoint returns only boolean flags indicating if values are set, not the actual values
 */
router.get('/:serverName/auth-values', requireJwtAuth, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const serverConfig = await getMCPServersRegistry().getServerConfig(serverName, user.id);
    if (!serverConfig) {
      return res.status(404).json({
        error: `MCP server '${serverName}' not found in configuration`,
      });
    }

    const pluginKey = `${Constants.mcp_prefix}${serverName}`;
    const authValueFlags = {};

    if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
      for (const varName of Object.keys(serverConfig.customUserVars)) {
        try {
          const value = await getUserPluginAuthValue(user.id, varName, false, pluginKey);
          authValueFlags[varName] = !!(value && value.length > 0);
        } catch (err) {
          logger.error(
            `[MCP Auth Value Flags] Error checking ${varName} for user ${user.id}:`,
            err,
          );
          authValueFlags[varName] = false;
        }
      }
    }

    res.json({
      success: true,
      serverName,
      authValueFlags,
    });
  } catch (error) {
    logger.error(
      `[MCP Auth Value Flags] Failed to check auth value flags for ${req.params.serverName}`,
      error,
    );
    res.status(500).json({ error: 'Failed to check auth value flags' });
  }
});

async function getOAuthHeaders(serverName, userId) {
  const serverConfig = await getMCPServersRegistry().getServerConfig(serverName, userId);
  return serverConfig?.oauth_headers ?? {};
}

/**
MCP Server CRUD Routes (User-Managed MCP Servers)
*/

// Permission checkers for MCP server management
const checkMCPUsePermissions = generateCheckAccess({
  permissionType: PermissionTypes.MCP_SERVERS,
  permissions: [Permissions.USE],
  getRoleByName: db.getRoleByName,
});

const checkMCPCreate = generateCheckAccess({
  permissionType: PermissionTypes.MCP_SERVERS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName: db.getRoleByName,
});

/**
 * Get list of accessible MCP servers
 * @route GET /api/mcp/servers
 * @param {Object} req.query - Query parameters for pagination and search
 * @param {number} [req.query.limit] - Number of results per page
 * @param {string} [req.query.after] - Pagination cursor
 * @param {string} [req.query.search] - Search query for title/description
 * @returns {MCPServerListResponse} 200 - Success response - application/json
 */
router.get('/servers', requireJwtAuth, checkMCPUsePermissions, getMCPServersList);

/**
 * Create a new MCP server
 * @route POST /api/mcp/servers
 * @param {MCPServerCreateParams} req.body - The MCP server creation parameters.
 * @returns {MCPServer} 201 - Success response - application/json
 */
router.post('/servers', requireJwtAuth, checkMCPCreate, createMCPServerController);

/**
 * Get single MCP server by ID
 * @route GET /api/mcp/servers/:serverName
 * @param {string} req.params.serverName - MCP server identifier.
 * @returns {MCPServer} 200 - Success response - application/json
 */
router.get(
  '/servers/:serverName',
  requireJwtAuth,
  checkMCPUsePermissions,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.VIEW,
    resourceIdParam: 'serverName',
  }),
  getMCPServerById,
);

/**
 * Update MCP server
 * @route PATCH /api/mcp/servers/:serverName
 * @param {string} req.params.serverName - MCP server identifier.
 * @param {MCPServerUpdateParams} req.body - The MCP server update parameters.
 * @returns {MCPServer} 200 - Success response - application/json
 */
router.patch(
  '/servers/:serverName',
  requireJwtAuth,
  checkMCPCreate,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.EDIT,
    resourceIdParam: 'serverName',
  }),
  updateMCPServerController,
);

/**
 * Delete MCP server
 * @route DELETE /api/mcp/servers/:serverName
 * @param {string} req.params.serverName - MCP server identifier.
 * @returns {Object} 200 - Success response - application/json
 */
router.delete(
  '/servers/:serverName',
  requireJwtAuth,
  checkMCPCreate,
  canAccessMCPServerResource({
    requiredPermission: PermissionBits.DELETE,
    resourceIdParam: 'serverName',
  }),
  deleteMCPServerController,
);

module.exports = router;
