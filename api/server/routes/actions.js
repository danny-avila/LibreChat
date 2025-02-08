const axios = require('axios');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createToken, findToken, updateToken } = require('~/models/Token');
const { logger, getFlowStateManager } = require('~/config');
const { decryptV2 } = require('~/server/utils/crypto');
const { logAxiosError } = require('~/utils');
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

  const flowManager = await getFlowStateManager(getLogStores);
  let identifier = `${action_id}`;
  try {
    let decodedState;
    try {
      decodedState = jwt.verify(state, JWT_SECRET);
    } catch (err) {
      await flowManager.failFlow(identifier, 'oauth', 'Invalid or expired state parameter');
      return res.status(400).send('Invalid or expired state parameter');
    }

    if (decodedState.action_id !== action_id) {
      await flowManager.failFlow(identifier, 'oauth', 'Mismatched action ID in state parameter');
      return res.status(400).send('Mismatched action ID in state parameter');
    }

    if (!decodedState.user) {
      await flowManager.failFlow(identifier, 'oauth', 'Invalid user ID in state parameter');
      return res.status(400).send('Invalid user ID in state parameter');
    }
    identifier = `${decodedState.user}:${action_id}`;

    const flowState = await flowManager.getFlowState(identifier, 'oauth');
    if (!flowState) {
      throw new Error('OAuth flow not found');
    }

    const client_id = await decryptV2(flowState.metadata.clientId);
    const client_secret = await decryptV2(flowState.metadata.clientSecret);

    const params = new URLSearchParams({
      code,
      client_id,
      client_secret,
      grant_type: 'authorization_code',
      redirect_uri: flowState.metadata.redirectUri,
    });

    let tokenResp;
    try {
      tokenResp = await axios({
        method: 'POST',
        url: flowState.metadata.tokenUrl,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        data: params.toString(),
      });
    } catch (error) {
      logAxiosError({
        message: 'Error exchanging OAuth code',
        error,
      });
      await flowManager.failFlow(identifier, 'oauth', `Error exchanging code: ${error?.message}`);
      return res.status(tokenResp.status).send('Error exchanging code');
    }

    const tokenJson = tokenResp.data;
    const { access_token, refresh_token, expires_in } = tokenJson;

    const tokenData = {
      identifier,
      type: 'oauth',
      token: access_token,
      userId: decodedState.user,
      expiresIn: parseInt(expires_in, 10) || 3600,
      metadata: {
        refreshToken: refresh_token,
        tokenUrl: flowState.metadata.tokenUrl,
        /** Encrypted */
        clientId: flowState.metadata.clientId,
        clientSecret: flowState.metadata.clientSecret,
      },
    };

    const existingToken = await findToken({ userId: decodedState.user, identifier });
    if (existingToken) {
      await updateToken({ identifier }, tokenData);
    } else {
      await createToken(tokenData);
    }

    await flowManager.completeFlow(identifier, 'oauth', tokenJson);

    res.send('Authentication successful. You can close this window and return to your chat.');
  } catch (error) {
    logger.error('Error in OAuth callback:', error);
    await flowManager.failFlow(identifier, 'oauth', error);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

module.exports = router;
