const express = require('express');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const { createToken, findToken, updateToken } = require('~/models/Token');
const { decryptMetadata } = require('~/server/services/ActionService');
const { logger, getFlowStateManager } = require('~/config');
const { getActions } = require('~/models/Action');
const { getLogStores } = require('~/cache');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

/**
 * @typedef {Object} OAuthTokens
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number} expires_in
 */

/**
 * Initiates OAuth login flow for the specified action.
 *
 * @route GET /actions/:action_id/oauth/login
 * @param {string} req.params.action_id - The ID of the action.
 * @returns {void} Redirects the user to the OAuth provider's login URL.
 */
router.get('/:action_id/oauth/login', async (req, res) => {
  const { action_id } = req.params;
  const [action] = await getActions({ action_id }, true);
  if (!action) {
    return res.status(404).send('Action not found');
  }

  let metadata = await decryptMetadata(action.metadata);

  const statePayload = {
    nonce: nanoid(),
    action_id,
  };

  const stateToken = jwt.sign(statePayload, JWT_SECRET, { expiresIn: '10m' });

  try {
    const flowManager = await getFlowStateManager(getLogStores);
    await flowManager.createFlow(action_id, 'oauth', {
      state: stateToken,
      userId: action.userId,
      clientId: metadata.oauth_client_id,
      clientSecret: metadata.oauth_client_secret,
      redirectUri: `${process.env.DOMAIN_CLIENT}/api/actions/${action_id}/oauth/callback`,
      tokenUrl: action.metadata.auth.client_url,
    });

    const redirectUri = `${process.env.DOMAIN_CLIENT}/api/actions/${action_id}/oauth/callback`;
    const params = new URLSearchParams({
      client_id: metadata.oauth_client_id,
      redirect_uri: redirectUri,
      scope: action.metadata.auth.scope,
      state: stateToken,
    });

    const authUrl = `${action.metadata.auth.authorization_url}?${params.toString()}`;
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Error initiating OAuth flow:', error);
    res.status(500).send('Failed to initiate OAuth flow');
  }
});

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

  const flowManager = await getFlowStateManager(getLogStores);
  try {
    let decodedState;
    try {
      decodedState = jwt.verify(state, JWT_SECRET);
    } catch (err) {
      await flowManager.failFlow(action_id, 'oauth', 'Invalid or expired state parameter');
      return res.status(400).send('Invalid or expired state parameter');
    }

    if (decodedState.action_id !== action_id) {
      await flowManager.failFlow(action_id, 'oauth', 'Mismatched action ID in state parameter');
      return res.status(400).send('Mismatched action ID in state parameter');
    }

    if (!decodedState.user) {
      await flowManager.failFlow(action_id, 'oauth', 'Invalid user ID in state parameter');
      return res.status(400).send('Invalid user ID in state parameter');
    }

    const flowState = await flowManager.getFlowState(action_id, 'oauth');
    if (!flowState) {
      return res.status(404).send('OAuth flow not found or expired');
    }

    // Token exchange
    const body = new URLSearchParams({
      client_id: flowState.metadata.clientId,
      client_secret: flowState.metadata.clientSecret,
      code,
      redirect_uri: flowState.metadata.redirectUri,
      grant_type: 'authorization_code',
    });

    const tokenResp = await fetch(flowState.metadata.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });

    if (!tokenResp.ok) {
      const error = await tokenResp.text();
      await flowManager.failFlow(action_id, 'oauth', `Error exchanging code: ${error}`);
      return res.status(tokenResp.status).send(`Error exchanging code: ${error}`);
    }

    const tokenJson = await tokenResp.json();
    const { access_token, refresh_token, expires_in } = tokenJson;

    const tokenData = {
      userId: decodedState.user,
      identifier: action_id,
      token: access_token,
      expiresIn: parseInt(expires_in, 10) || 3600,
      metadata: {
        refreshToken: refresh_token,
        clientId: flowState.metadata.clientId,
        clientSecret: flowState.metadata.clientSecret,
        tokenUrl: flowState.metadata.tokenUrl,
      },
    };

    const existingToken = await findToken({ identifier: action_id });
    if (existingToken) {
      await updateToken({ identifier: action_id }, tokenData);
    } else {
      await createToken(tokenData);
    }

    await flowManager.completeFlow(action_id, 'oauth', tokenJson);

    res.send('Authentication successful. You can close this window and return to your chat.');
  } catch (error) {
    logger.error('Error in OAuth callback:', error);
    await flowManager.failFlow(action_id, 'oauth', error);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

module.exports = router;
