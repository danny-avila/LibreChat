const { logger } = require('@librechat/data-schemas');
const { MCPOAuthHandler } = require('@librechat/api');
const { Router } = require('express');
const { getMCPSetupData, getServerConnectionStatus } = require('~/server/services/MCP');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { setCachedTools, getCachedTools } = require('~/server/services/Config');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { requireJwtAuth } = require('~/server/middleware');
const { getLogStores } = require('~/cache');
const {
  getCachedPrompts,
  setCachedPrompts,
  invalidateCachedPrompts,
} = require('~/server/services/Config');

const router = Router();

/**
 * Initiate OAuth flow
 * This endpoint is called when the user clicks the auth link in the UI
 */
router.get('/:serverName/oauth/initiate', requireJwtAuth, async (req, res) => {
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

    const { authorizationUrl, flowId: oauthFlowId } = await MCPOAuthHandler.initiateOAuthFlow(
      serverName,
      serverUrl,
      userId,
      oauthConfig,
    );

    logger.debug('[MCP OAuth] OAuth flow initiated', { oauthFlowId, authorizationUrl });

    // Redirect user to the authorization URL
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
      return res.redirect(`/oauth/error?error=${encodeURIComponent(String(oauthError))}`);
    }

    if (!code || typeof code !== 'string') {
      logger.error('[MCP OAuth] Missing or invalid code');
      return res.redirect('/oauth/error?error=missing_code');
    }

    if (!state || typeof state !== 'string') {
      logger.error('[MCP OAuth] Missing or invalid state');
      return res.redirect('/oauth/error?error=missing_state');
    }

    const flowId = state;
    logger.debug('[MCP OAuth] Using flow ID from state', { flowId });

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    logger.debug('[MCP OAuth] Getting flow state for flowId: ' + flowId);
    const flowState = await MCPOAuthHandler.getFlowState(flowId, flowManager);

    if (!flowState) {
      logger.error('[MCP OAuth] Flow state not found for flowId:', flowId);
      return res.redirect('/oauth/error?error=invalid_state');
    }

    logger.debug('[MCP OAuth] Flow state details', {
      serverName: flowState.serverName,
      userId: flowState.userId,
      hasMetadata: !!flowState.metadata,
      hasClientInfo: !!flowState.clientInfo,
      hasCodeVerifier: !!flowState.codeVerifier,
    });

    logger.debug('[MCP OAuth] Completing OAuth flow');
    const tokens = await MCPOAuthHandler.completeOAuthFlow(flowId, code, flowManager);
    logger.info('[MCP OAuth] OAuth flow completed, tokens received in callback route');

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
            findToken,
            updateToken,
            createToken,
            deleteTokens,
          },
        });

        logger.info(
          `[MCP OAuth] Successfully reconnected ${serverName} for user ${flowState.userId}`,
        );

        const userTools = (await getCachedTools({ userId: flowState.userId })) || {};

        const mcpDelimiter = Constants.mcp_delimiter;
        for (const key of Object.keys(userTools)) {
          if (key.endsWith(`${mcpDelimiter}${serverName}`)) {
            delete userTools[key];
          }
        }

        const tools = await userConnection.fetchTools();
        for (const tool of tools) {
          const name = `${tool.name}${Constants.mcp_delimiter}${serverName}`;
          userTools[name] = {
            type: 'function',
            ['function']: {
              name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          };
        }

        await setCachedTools(userTools, { userId: flowState.userId });

        logger.debug(
          `[MCP OAuth] Cached ${tools.length} tools for ${serverName} user ${flowState.userId}`,
        );
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
    const redirectUrl = `/oauth/success?serverName=${encodeURIComponent(serverName)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('[MCP OAuth] OAuth callback error', error);
    res.redirect('/oauth/error?error=callback_failed');
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
 * Check OAuth flow status
 * This endpoint can be used to poll the status of an OAuth flow
 */
router.get('/oauth/status/:flowId', async (req, res) => {
  try {
    const { flowId } = req.params;
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
router.post('/:serverName/reinitialize', requireJwtAuth, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info(`[MCP Reinitialize] Reinitializing server: ${serverName}`);

    const mcpManager = getMCPManager();
    const serverConfig = mcpManager.getRawConfig(serverName);
    if (!serverConfig) {
      return res.status(404).json({
        error: `MCP server '${serverName}' not found in configuration`,
      });
    }

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    await mcpManager.disconnectUserConnection(user.id, serverName);
    logger.info(
      `[MCP Reinitialize] Disconnected existing user connection for server: ${serverName}`,
    );

    let customUserVars = {};
    if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
      for (const varName of Object.keys(serverConfig.customUserVars)) {
        try {
          const value = await getUserPluginAuthValue(user.id, varName, false);
          customUserVars[varName] = value;
        } catch (err) {
          logger.error(`[MCP Reinitialize] Error fetching ${varName} for user ${user.id}:`, err);
        }
      }
    }

    let userConnection = null;
    let oauthRequired = false;
    let oauthUrl = null;

    try {
      userConnection = await mcpManager.getUserConnection({
        user,
        serverName,
        flowManager,
        customUserVars,
        tokenMethods: {
          findToken,
          updateToken,
          createToken,
          deleteTokens,
        },
        returnOnOAuth: true,
        oauthStart: async (authURL) => {
          logger.info(`[MCP Reinitialize] OAuth URL received: ${authURL}`);
          oauthUrl = authURL;
          oauthRequired = true;
        },
      });

      logger.info(`[MCP Reinitialize] Successfully established connection for ${serverName}`);
    } catch (err) {
      logger.info(`[MCP Reinitialize] getUserConnection threw error: ${err.message}`);
      logger.info(
        `[MCP Reinitialize] OAuth state - oauthRequired: ${oauthRequired}, oauthUrl: ${oauthUrl ? 'present' : 'null'}`,
      );

      const isOAuthError =
        err.message?.includes('OAuth') ||
        err.message?.includes('authentication') ||
        err.message?.includes('401');

      const isOAuthFlowInitiated = err.message === 'OAuth flow initiated - return early';

      if (isOAuthError || oauthRequired || isOAuthFlowInitiated) {
        logger.info(
          `[MCP Reinitialize] OAuth required for ${serverName} (isOAuthError: ${isOAuthError}, oauthRequired: ${oauthRequired}, isOAuthFlowInitiated: ${isOAuthFlowInitiated})`,
        );
        oauthRequired = true;
      } else {
        logger.error(
          `[MCP Reinitialize] Error initializing MCP server ${serverName} for user:`,
          err,
        );
        return res.status(500).json({ error: 'Failed to reinitialize MCP server for user' });
      }
    }

    if (userConnection && !oauthRequired) {
      const userTools = (await getCachedTools({ userId: user.id })) || {};

      const mcpDelimiter = Constants.mcp_delimiter;
      for (const key of Object.keys(userTools)) {
        if (key.endsWith(`${mcpDelimiter}${serverName}`)) {
          delete userTools[key];
        }
      }

      const tools = await userConnection.fetchTools();
      for (const tool of tools) {
        const name = `${tool.name}${Constants.mcp_delimiter}${serverName}`;
        userTools[name] = {
          type: 'function',
          ['function']: {
            name,
            description: tool.description,
            parameters: tool.inputSchema,
          },
        };
      }

      await setCachedTools(userTools, { userId: user.id });
    }

    logger.debug(
      `[MCP Reinitialize] Sending response for ${serverName} - oauthRequired: ${oauthRequired}, oauthUrl: ${oauthUrl ? 'present' : 'null'}`,
    );

    const getResponseMessage = () => {
      if (oauthRequired) {
        return `MCP server '${serverName}' ready for OAuth authentication`;
      }
      if (userConnection) {
        return `MCP server '${serverName}' reinitialized successfully`;
      }
      return `Failed to reinitialize MCP server '${serverName}'`;
    };

    res.json({
      success: Boolean((userConnection && !oauthRequired) || (oauthRequired && oauthUrl)),
      message: getResponseMessage(),
      serverName,
      oauthRequired,
      oauthUrl,
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

    for (const [serverName] of Object.entries(mcpConfig)) {
      connectionStatus[serverName] = await getServerConnectionStatus(
        user.id,
        serverName,
        appConnections,
        userConnections,
        oauthServers,
      );
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

    const mcpManager = getMCPManager();
    const serverConfig = mcpManager.getRawConfig(serverName);
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

/**
 * Check which authentication values exist for a specific MCP server
 * This endpoint returns only boolean flags indicating if values are set, not the actual values
 */
router.get('/prompts/:serverName', requireJwtAuth, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;
    console.log("user promptslist", user);
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Try to get from cache first
    const cachedPrompts = await getCachedPrompts({
      userId: user.id,
      serverName,
    });

    if (cachedPrompts) {
      return res.json(cachedPrompts);
    }

    // Cache miss - fetch only for this server
    const mcpManager = getMCPManager(user.id);
    console.log("mcpManager", mcpManager);

    // Use connection to fetch server-specific prompts
    // ... your code to fetch prompts for this server ...

    // Cache the results
    let mcpPrompts = await setCachedPrompts(mcpManager, {
      userId: user.id,
      serverName,
    });

    res.json(mcpPrompts);
  } catch (error) {
    logger.error('[MCP] Server prompts error', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mcp-prompts', requireJwtAuth, async (req, res) => {
  try {
    logger.debug("MCP prompts request", req.user?.id);
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Try cache first (with error handling)
    try {
      const cachedPrompts = await getCachedPrompts({
        userId: user.id,
      });
      //logger.debug("cachedPrompts", cachedPrompts);
      if (cachedPrompts && Object.keys(cachedPrompts).length > 0) {
        logger.debug("[MCP Get Prompts] Returning cached prompts for user", user.id);
        return res.json(cachedPrompts);
      }
    } catch (cacheError) {
      logger.warn("Failed to read from cache:", cacheError);
    }

    // Get MCP Manager safely
    const mcpManager = await getMCPManager(user.id);
    if (!mcpManager) {
      logger.debug("No MCP manager or connections available", mcpManager);
      return res.json({});
    }

    let availablePrompts = {};

    // Process connections safely
    const connectionPromises = Array.from(mcpManager).map(async ([key, connection]) => {
      // logger.debug("key", key, ": connection", connection);
      try {
        logger.debug(`Processing connection: ${key}`);

        if (!connection || typeof connection.fetchPrompts !== 'function') {
          logger.warn(`Invalid connection for ${key}`);
          return;
        }

        const mcpPrompts = await connection.fetchPrompts(key);

        if (!Array.isArray(mcpPrompts)) {
          logger.warn(`No prompts returned from ${key}`);
          return;
        }

        // Process prompts for this connection
        for (const prompt of mcpPrompts) {
          if (!prompt || !prompt.name) {
            logger.warn(`Invalid prompt from ${key}:`, prompt);
            continue;
          }

          const name = `${key}:${prompt.name}`;
          availablePrompts[name] = {
            name: prompt.name,
            mcpServerName: key,
            description: prompt.description || '',
            arguments: Array.isArray(prompt.arguments) ? prompt.arguments : [],
            promptKey: name,
          };
        }
      } catch (connectionError) {
        logger.error(`Error fetching prompts from ${key}:`, connectionError);
        // Don't throw - just log and continue with other connections
      }
    });

    // Wait for all connections (with timeout)
    try {
      await Promise.all(connectionPromises);
    } catch (promiseError) {
      // Continue anyway - we might have some prompts
    }

    // Cache the results (don't fail request if caching fails)
    try {
      await setCachedPrompts(availablePrompts, {
        userId: user.id,
      });
      logger.debug("Cached new prompts for user", user.id);
    } catch (cacheError) {
      logger.warn("Failed to cache prompts:", cacheError);
    }

    res.json(availablePrompts);
  } catch (error) {
    logger.error(`[MCP Get Prompts] Fatal error:`, error);
    res.status(500).json({ error: 'Failed to fetch MCP prompts' });
  }
});

// Route to clear MCP cache
router.post('/prompts/cache/clear', requireJwtAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    await invalidateCachedPrompts({
      userId: user.id,
      invalidateAll: true,
    });

    res.json({ success: true, message: 'MCP prompts cache cleared' });
  } catch (error) {
    logger.error('[MCP] Cache clear error', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;
