const { Router } = require('express');
const { MCPOAuthHandler } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { requireJwtAuth } = require('~/server/middleware');
const { getFlowStateManager } = require('~/config');
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

    logger.info('[MCP OAuth] Initiate request', { serverName, userId, flowId });

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);

    // Get the flow state to retrieve OAuth config
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

    // Create OAuth handler and initiate the flow
    const oauthHandler = new MCPOAuthHandler(flowManager);
    const { authorizationUrl, flowId: oauthFlowId } = await oauthHandler.initiateOAuthFlow(
      serverName,
      serverUrl,
      userId,
      oauthConfig,
    );

    logger.info('[MCP OAuth] OAuth flow initiated', { oauthFlowId, authorizationUrl });

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

    logger.info('[MCP OAuth] Callback received', {
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
    logger.info('[MCP OAuth] Using flow ID from state', { flowId });

    const flowsCache = getLogStores(CacheKeys.FLOWS);
    const flowManager = getFlowStateManager(flowsCache);
    const oauthHandler = new MCPOAuthHandler(flowManager);

    logger.debug('[MCP OAuth] Getting flow state for flowId: ' + flowId);
    const flowState = await oauthHandler.getFlowState(flowId);

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
    logger.info('[MCP OAuth] Completing OAuth flow');
    const tokens = await oauthHandler.completeOAuthFlow(flowId, code);
    logger.info('[MCP OAuth] OAuth flow completed, tokens received');

    // For system-level OAuth, we need to store the tokens and retry the connection
    if (flowState.userId === 'system') {
      logger.info(`[MCP OAuth] System-level OAuth completed for ${serverName}`);
      // TODO: Implement a mechanism to retry the connection with the new tokens
      // This could involve:
      // 1. Storing tokens in a system-level token store
      // 2. Notifying the MCP manager to retry the connection
      // 3. Using a webhook or event system to trigger reconnection
    }

    /** ID of the flow that the tool/connection is waiting for */
    const toolFlowId = flowState.metadata?.toolFlowId;
    if (toolFlowId) {
      logger.info('[MCP OAuth] Completing tool flow', { toolFlowId });
      await flowManager.completeFlow(toolFlowId, 'mcp_oauth', tokens);
    }

    // Redirect to success page with flow ID
    const redirectUrl = `/oauth/success?flowId=${encodeURIComponent(flowId)}&serverName=${encodeURIComponent(serverName)}`;
    logger.info('[MCP OAuth] Redirecting to success page', { redirectUrl });
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

module.exports = router;
