const { Router } = require('express');
const { logger } = require('@librechat/data-schemas');
const { MCPOAuthHandler } = require('@librechat/api');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { setCachedTools, getCachedTools, loadCustomConfig } = require('~/server/services/Config');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');
const { getMCPManager, getFlowStateManager } = require('~/config');
const { requireJwtAuth } = require('~/server/middleware');
const { getLogStores } = require('~/cache');

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

    // Extract flow ID from state
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

    // Complete the OAuth flow
    logger.debug('[MCP OAuth] Completing OAuth flow');
    const tokens = await MCPOAuthHandler.completeOAuthFlow(flowId, code, flowManager);
    logger.info('[MCP OAuth] OAuth flow completed, tokens received in callback route');

    // Try to establish the MCP connection with the new tokens
    try {
      const mcpManager = getMCPManager(flowState.userId);
      logger.debug(`[MCP OAuth] Attempting to reconnect ${serverName} with new OAuth tokens`);

      // For user-level OAuth, try to establish the connection
      if (flowState.userId !== 'system') {
        // We need to get the user object - in this case we'll need to reconstruct it
        const user = { id: flowState.userId };

        // Try to establish connection with the new tokens
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

        // Fetch and cache tools now that we have a successful connection
        const userTools = (await getCachedTools({ userId: flowState.userId })) || {};

        // Remove any old tools from this server in the user's cache
        const mcpDelimiter = Constants.mcp_delimiter;
        for (const key of Object.keys(userTools)) {
          if (key.endsWith(`${mcpDelimiter}${serverName}`)) {
            delete userTools[key];
          }
        }

        // Add the new tools from this server
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

        // Save the updated user tool cache
        await setCachedTools(userTools, { userId: flowState.userId });

        logger.debug(
          `[MCP OAuth] Cached ${tools.length} tools for ${serverName} user ${flowState.userId}`,
        );
      } else {
        logger.debug(`[MCP OAuth] System-level OAuth completed for ${serverName}`);
      }
    } catch (error) {
      // Don't fail the OAuth callback if reconnection fails - the tokens are still saved
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

    // Allow system flows or user-owned flows
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

    // Generate the flow ID for this user/server combination
    const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);

    // Check if flow exists
    const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');

    if (!flowState) {
      logger.debug(`[MCP OAuth Cancel] No active flow found for ${serverName}`);
      return res.json({
        success: true,
        message: 'No active OAuth flow to cancel',
      });
    }

    // Cancel the flow by marking it as failed
    await flowManager.completeFlow(flowId, 'mcp_oauth', null, 'User cancelled OAuth flow');

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

    const config = await loadCustomConfig();
    if (!config || !config.mcpServers || !config.mcpServers[serverName]) {
      return res.status(404).json({
        error: `MCP server '${serverName}' not found in configuration`,
      });
    }

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);
    const mcpManager = getMCPManager();

    await mcpManager.disconnectServer(serverName);
    logger.info(`[MCP Reinitialize] Disconnected existing server: ${serverName}`);

    const serverConfig = config.mcpServers[serverName];
    mcpManager.mcpConfigs[serverName] = serverConfig;
    let customUserVars = {};
    if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
      for (const varName of Object.keys(serverConfig.customUserVars)) {
        try {
          const value = await getUserPluginAuthValue(user.id, varName, false);
          if (value) {
            customUserVars[varName] = value;
          }
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
        returnOnOAuth: true, // Return immediately when OAuth is initiated
        // Add OAuth handlers to capture the OAuth URL when needed
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

      // Check if this is an OAuth error - if so, the flow state should be set up now
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
        // Don't return error - continue so frontend can handle OAuth
      } else {
        logger.error(
          `[MCP Reinitialize] Error initializing MCP server ${serverName} for user:`,
          err,
        );
        return res.status(500).json({ error: 'Failed to reinitialize MCP server for user' });
      }
    }

    // Only fetch and cache tools if we successfully connected (no OAuth required)
    if (userConnection && !oauthRequired) {
      const userTools = (await getCachedTools({ userId: user.id })) || {};

      // Remove any old tools from this server in the user's cache
      const mcpDelimiter = Constants.mcp_delimiter;
      for (const key of Object.keys(userTools)) {
        if (key.endsWith(`${mcpDelimiter}${serverName}`)) {
          delete userTools[key];
        }
      }

      // Add the new tools from this server
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

      // Save the updated user tool cache
      await setCachedTools(userTools, { userId: user.id });
    }

    logger.debug(
      `[MCP Reinitialize] Sending response for ${serverName} - oauthRequired: ${oauthRequired}, oauthUrl: ${oauthUrl ? 'present' : 'null'}`,
    );

    res.json({
      success: true,
      message: oauthRequired
        ? `MCP server '${serverName}' ready for OAuth authentication`
        : `MCP server '${serverName}' reinitialized successfully`,
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
 * This endpoint returns the actual connection status from MCPManager without disconnecting idle connections
 */
router.get('/connection/status', requireJwtAuth, async (req, res) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const mcpManager = getMCPManager(user.id);
    const connectionStatus = {};

    const printConfig = false;
    const config = await loadCustomConfig(printConfig);
    const mcpConfig = config?.mcpServers;

    const appConnections = mcpManager.getAllConnections() || new Map();
    const userConnections = mcpManager.getUserConnections(user.id) || new Map();
    const oauthServers = mcpManager.getOAuthServers() || new Set();

    if (!mcpConfig) {
      return res.status(404).json({ error: 'MCP config not found' });
    }

    // Get flow manager to check for active/timed-out OAuth flows
    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    for (const [serverName] of Object.entries(mcpConfig)) {
      const getConnectionState = (serverName) =>
        appConnections.get(serverName)?.connectionState ??
        userConnections.get(serverName)?.connectionState ??
        'disconnected';

      const baseConnectionState = getConnectionState(serverName);

      let hasActiveOAuthFlow = false;
      let hasFailedOAuthFlow = false;

      if (baseConnectionState === 'disconnected' && oauthServers.has(serverName)) {
        try {
          // Check for user-specific OAuth flows
          const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);
          const flowState = await flowManager.getFlowState(flowId, 'mcp_oauth');
          if (flowState) {
            // Check if flow failed or timed out
            const flowAge = Date.now() - flowState.createdAt;
            const flowTTL = flowState.ttl || 180000; // Default 3 minutes

            if (flowState.status === 'FAILED' || flowAge > flowTTL) {
              hasFailedOAuthFlow = true;
              logger.debug(`[MCP Connection Status] Found failed OAuth flow for ${serverName}`, {
                flowId,
                status: flowState.status,
                flowAge,
                flowTTL,
                timedOut: flowAge > flowTTL,
              });
            } else if (flowState.status === 'PENDING') {
              hasActiveOAuthFlow = true;
              logger.debug(`[MCP Connection Status] Found active OAuth flow for ${serverName}`, {
                flowId,
                flowAge,
                flowTTL,
              });
            }
          }
        } catch (error) {
          logger.error(
            `[MCP Connection Status] Error checking OAuth flows for ${serverName}:`,
            error,
          );
        }
      }

      // Determine the final connection state
      let finalConnectionState = baseConnectionState;
      if (hasFailedOAuthFlow) {
        finalConnectionState = 'error'; // Report as error if OAuth failed
      } else if (hasActiveOAuthFlow && baseConnectionState === 'disconnected') {
        finalConnectionState = 'connecting'; // Still waiting for OAuth
      }

      connectionStatus[serverName] = {
        requiresOAuth: oauthServers.has(serverName),
        connectionState: finalConnectionState,
      };
    }

    res.json({
      success: true,
      connectionStatus,
    });
  } catch (error) {
    logger.error('[MCP Connection Status] Failed to get connection status', error);
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

    const printConfig = false;
    const config = await loadCustomConfig(printConfig);
    if (!config || !config.mcpServers || !config.mcpServers[serverName]) {
      return res.status(404).json({
        error: `MCP server '${serverName}' not found in configuration`,
      });
    }

    const serverConfig = config.mcpServers[serverName];
    const pluginKey = `${Constants.mcp_prefix}${serverName}`;
    const authValueFlags = {};

    // Check existence of saved values for each custom user variable (don't fetch actual values)
    if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
      for (const varName of Object.keys(serverConfig.customUserVars)) {
        try {
          const value = await getUserPluginAuthValue(user.id, varName, false, pluginKey);
          // Only store boolean flag indicating if value exists
          authValueFlags[varName] = !!(value && value.length > 0);
        } catch (err) {
          logger.error(
            `[MCP Auth Value Flags] Error checking ${varName} for user ${user.id}:`,
            err,
          );
          // Default to false if we can't check
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

module.exports = router;
