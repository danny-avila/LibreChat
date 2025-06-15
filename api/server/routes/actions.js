const express = require('express');
const jwt = require('jsonwebtoken');
const { getAccessToken } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { findToken, updateToken, createToken } = require('~/models');
const { getFlowStateManager } = require('~/config');
const { getLogStores } = require('~/cache');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Handles the OAuth callback and exchanges the authorization code for tokens.
 *
 * @route GET /actions/:action_id/oauth/callback
 * @param {string} req.params.action_id - The ID of the action.
 * @param {string} req.query.code - The authorization code returned by the provider.
 * @param {string} req.query.state - The state token to verify the authenticity of the request.
 * @returns {void} Sends a success message after updating the action with OAuth tokens.
 */
router.get('/:action_id/oauth/callback', async (req, res) => {
  const { action_id } = req.params;
  const { code, state } = req.query;
  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = getFlowStateManager(flowsCache);
  let identifier = action_id;
  try {
    let decodedState;
    try {
      decodedState = jwt.verify(state, JWT_SECRET);
    } catch (err) {
      logger.error('Error verifying state parameter:', err);
      await flowManager.failFlow(identifier, 'oauth', 'Invalid or expired state parameter');
      return res.redirect('/oauth/error?error=invalid_state');
    }

    if (decodedState.action_id !== action_id) {
      await flowManager.failFlow(identifier, 'oauth', 'Mismatched action ID in state parameter');
      return res.redirect('/oauth/error?error=invalid_state');
    }

    if (!decodedState.user) {
      await flowManager.failFlow(identifier, 'oauth', 'Invalid user ID in state parameter');
      return res.redirect('/oauth/error?error=invalid_state');
    }
    identifier = `${decodedState.user}:${action_id}`;
    const flowState = await flowManager.getFlowState(identifier, 'oauth');
    if (!flowState) {
      throw new Error('OAuth flow not found');
    }

    const tokenData = await getAccessToken(
      {
        code,
        userId: decodedState.user,
        identifier,
        client_url: flowState.metadata.client_url,
        redirect_uri: flowState.metadata.redirect_uri,
        token_exchange_method: flowState.metadata.token_exchange_method,
        /** Encrypted values */
        encrypted_oauth_client_id: flowState.metadata.encrypted_oauth_client_id,
        encrypted_oauth_client_secret: flowState.metadata.encrypted_oauth_client_secret,
      },
      {
        findToken,
        updateToken,
        createToken,
      },
    );
    await flowManager.completeFlow(identifier, 'oauth', tokenData);

    /** Redirect to React success page */
    const serverName = flowState.metadata?.action_name || `Action ${action_id}`;
    const redirectUrl = `/oauth/success?serverName=${encodeURIComponent(serverName)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Error in OAuth callback:', error);
    await flowManager.failFlow(identifier, 'oauth', error);
    res.redirect('/oauth/error?error=callback_failed');
  }
});

module.exports = router;
