const { Router } = require('express');
const { logger } = require('@librechat/data-schemas');
const { MCPOAuthHandler } = require('@librechat/api');
const { CacheKeys, Constants } = require('librechat-data-provider');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { setCachedTools, getCachedTools, loadCustomConfig } = require('~/server/services/Config');
const { getUserPluginAuthValueByPlugin } = require('~/server/services/PluginService');
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

    // For system-level OAuth, we need to store the tokens and retry the connection
    if (flowState.userId === 'system') {
      logger.debug(`[MCP OAuth] System-level OAuth completed for ${serverName}`);
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
 * Get connection status for all MCP servers
 * This endpoint returns the actual connection status from MCPManager
 */
router.get('/connection/status', requireJwtAuth, async (req, res) => {
  try {
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const mcpManager = getMCPManager();
    const connectionStatus = {};

    // Get all MCP server names from custom config
    const config = await loadCustomConfig();
    const mcpConfig = config?.mcpServers;

    if (mcpConfig) {
      for (const [serverName, config] of Object.entries(mcpConfig)) {
        try {
          // Check if this is an app-level connection (exists in mcpManager.connections)
          const appConnection = mcpManager.getConnection(serverName);
          const hasAppConnection = !!appConnection;

          // Check if this is a user-level connection (exists in mcpManager.userConnections)
          const userConnection = mcpManager.getUserConnectionIfExists(user.id, serverName);
          const hasUserConnection = !!userConnection;

          // Determine if connected based on actual connection state
          let connected = false;
          if (hasAppConnection) {
            connected = await appConnection.isConnected();
          } else if (hasUserConnection) {
            connected = await userConnection.isConnected();
          }

          // Determine if this server requires user authentication
          const hasAuthConfig =
            config.customUserVars && Object.keys(config.customUserVars).length > 0;
          const requiresOAuth = req.app.locals.mcpOAuthRequirements?.[serverName] || false;

          connectionStatus[serverName] = {
            connected,
            hasAuthConfig,
            hasConnection: hasAppConnection || hasUserConnection,
            isAppLevel: hasAppConnection,
            isUserLevel: hasUserConnection,
            requiresOAuth,
          };
        } catch (error) {
          logger.error(
            `[MCP Connection Status] Error checking connection for ${serverName}:`,
            error,
          );
          connectionStatus[serverName] = {
            connected: false,
            hasAuthConfig: config.customUserVars && Object.keys(config.customUserVars).length > 0,
            hasConnection: false,
            isAppLevel: false,
            isUserLevel: false,
            requiresOAuth: req.app.locals.mcpOAuthRequirements?.[serverName] || false,
            error: error.message,
          };
        }
      }
    }

    logger.info(`[MCP Connection Status] Returning status for user ${user.id}:`, connectionStatus);

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

    const config = await loadCustomConfig();
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
          const value = await getUserPluginAuthValueByPlugin(user.id, varName, pluginKey, false);
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

/**
 * Check if a specific MCP server requires OAuth
 * This endpoint checks if a specific MCP server requires OAuth authentication
 */
router.get('/:serverName/oauth/required', requireJwtAuth, async (req, res) => {
  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const mcpManager = getMCPManager();
    const requiresOAuth = await mcpManager.isOAuthRequired(serverName);

    res.json({
      success: true,
      serverName,
      requiresOAuth,
    });
  } catch (error) {
    logger.error(
      `[MCP OAuth Required] Failed to check OAuth requirement for ${req.params.serverName}`,
      error,
    );
    res.status(500).json({ error: 'Failed to check OAuth requirement' });
  }
});

/**
 * Complete MCP server reinitialization after OAuth
 * This endpoint completes the reinitialization process after OAuth authentication
 */
router.post('/:serverName/reinitialize/complete', requireJwtAuth, async (req, res) => {
  let responseSent = false;

  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      responseSent = true;
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info(`[MCP Complete Reinitialize] Starting completion for ${serverName}`);

    const mcpManager = getMCPManager();

    // Wait for connection to be established via event-driven approach
    const userConnection = await new Promise((resolve, reject) => {
      // Set a reasonable timeout (10 seconds)
      const timeout = setTimeout(() => {
        mcpManager.removeListener('connectionEstablished', connectionHandler);
        reject(new Error('Timeout waiting for connection establishment'));
      }, 10000);

      const connectionHandler = ({
        userId: eventUserId,
        serverName: eventServerName,
        connection,
      }) => {
        if (eventUserId === user.id && eventServerName === serverName) {
          clearTimeout(timeout);
          mcpManager.removeListener('connectionEstablished', connectionHandler);
          resolve(connection);
        }
      };

      // Check if connection already exists
      const existingConnection = mcpManager.getUserConnectionIfExists(user.id, serverName);
      if (existingConnection) {
        clearTimeout(timeout);
        resolve(existingConnection);
        return;
      }

      // Listen for the connection establishment event
      mcpManager.on('connectionEstablished', connectionHandler);
    });

    if (!userConnection) {
      responseSent = true;
      return res.status(404).json({ error: 'User connection not found' });
    }

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

    responseSent = true;
    res.json({
      success: true,
      message: `MCP server '${serverName}' reinitialized successfully`,
      serverName,
    });
  } catch (error) {
    logger.error(
      `[MCP Complete Reinitialize] Error completing reinitialization for ${req.params.serverName}:`,
      error,
    );

    if (!responseSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to complete MCP server reinitialization',
        serverName: req.params.serverName,
      });
    }
  }
});

/**
 * Reinitialize MCP server
 * This endpoint allows reinitializing a specific MCP server
 */
router.post('/:serverName/reinitialize', requireJwtAuth, async (req, res) => {
  let responseSent = false;

  try {
    const { serverName } = req.params;
    const user = req.user;

    if (!user?.id) {
      responseSent = true;
      return res.status(401).json({ error: 'User not authenticated' });
    }

    logger.info(`[MCP Reinitialize] Reinitializing server: ${serverName}`);

    const config = await loadCustomConfig();
    if (!config || !config.mcpServers || !config.mcpServers[serverName]) {
      responseSent = true;
      return res.status(404).json({
        error: `MCP server '${serverName}' not found in configuration`,
      });
    }

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);
    const mcpManager = getMCPManager();

    // Clean up any stale OAuth flows for this server
    try {
      const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);
      const existingFlow = await flowManager.getFlowState(flowId, 'mcp_oauth');
      if (existingFlow && existingFlow.status === 'PENDING') {
        logger.info(`[MCP Reinitialize] Cleaning up stale OAuth flow for ${serverName}`);
        await flowManager.failFlow(flowId, 'mcp_oauth', new Error('OAuth flow interrupted'));
      }
    } catch (error) {
      logger.warn(
        `[MCP Reinitialize] Error cleaning up stale OAuth flow for ${serverName}:`,
        error,
      );
    }

    await mcpManager.disconnectServer(serverName);
    logger.info(`[MCP Reinitialize] Disconnected existing server: ${serverName}`);

    const serverConfig = config.mcpServers[serverName];
    mcpManager.mcpConfigs[serverName] = serverConfig;
    let customUserVars = {};
    if (serverConfig.customUserVars && typeof serverConfig.customUserVars === 'object') {
      for (const varName of Object.keys(serverConfig.customUserVars)) {
        try {
          const pluginKey = `${Constants.mcp_prefix}${serverName}`;
          const value = await getUserPluginAuthValueByPlugin(user.id, varName, pluginKey, false);
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
        oauthStart: (authURL) => {
          // This will be called if OAuth is required
          oauthRequired = true;
          responseSent = true;
          logger.info(`[MCP Reinitialize] OAuth required for ${serverName}, auth URL: ${authURL}`);

          // Get the flow ID for polling
          const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);

          // Return the OAuth response immediately - client will poll for completion
          res.json({
            success: false,
            oauthRequired: true,
            authURL,
            flowId,
            message: `OAuth authentication required for MCP server '${serverName}'`,
            serverName,
          });
        },
        oauthEnd: () => {
          // This will be called when OAuth flow completes
          logger.info(`[MCP Reinitialize] OAuth flow completed for ${serverName}`);
        },
      });

      // If response was already sent for OAuth, don't continue
      if (responseSent) {
        return;
      }
    } catch (err) {
      logger.error(`[MCP Reinitialize] Error initializing MCP server ${serverName} for user:`, err);

      // Check if this is an OAuth error
      if (err.message && err.message.includes('OAuth required')) {
        // Try to get the OAuth URL from the flow manager
        try {
          const flowId = MCPOAuthHandler.generateFlowId(user.id, serverName);
          const existingFlow = await flowManager.getFlowState(flowId, 'mcp_oauth');

          if (existingFlow && existingFlow.metadata) {
            const { serverUrl, oauth: oauthConfig } = existingFlow.metadata;
            if (serverUrl && oauthConfig) {
              const { authorizationUrl: authUrl } = await MCPOAuthHandler.initiateOAuthFlow(
                serverName,
                serverUrl,
                user.id,
                oauthConfig,
              );

              return res.json({
                success: false,
                oauthRequired: true,
                authURL: authUrl,
                flowId,
                message: `OAuth authentication required for MCP server '${serverName}'`,
                serverName,
              });
            }
          }
        } catch (oauthErr) {
          logger.error(`[MCP Reinitialize] Error getting OAuth URL for ${serverName}:`, oauthErr);
        }

        responseSent = true;
        return res.status(401).json({
          success: false,
          oauthRequired: true,
          message: `OAuth authentication required for MCP server '${serverName}'`,
          serverName,
        });
      }

      responseSent = true;
      return res.status(500).json({ error: 'Failed to reinitialize MCP server for user' });
    }

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

    responseSent = true;
    res.json({
      success: true,
      message: `MCP server '${serverName}' reinitialized successfully`,
      serverName,
    });
  } catch (error) {
    logger.error('[MCP Reinitialize] Unexpected error', error);
    if (!responseSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

module.exports = router;
