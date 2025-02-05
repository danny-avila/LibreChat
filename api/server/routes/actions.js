const fetch = require('node-fetch');
const express = require('express');
const { nanoid } = require('nanoid');
const jwt = require('jsonwebtoken');
const { updateAction, getActions } = require('~/models/Action');
const { decryptMetadata } = require('~/server/services/ActionService');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Use a secure secret in production

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

  const redirectUri = `${process.env.DOMAIN_CLIENT}/api/actions/${action_id}/oauth/callback`;
  const params = new URLSearchParams({
    client_id:  metadata.oauth_client_id,
    redirect_uri: redirectUri,
    scope: action.metadata.auth.scope,
    state: stateToken,
  });

  const authUrl = `${action.metadata.auth.authorization_url}?${params.toString()}`;
  res.redirect(authUrl);
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

  let decodedState;
  try {
    decodedState = jwt.verify(state, JWT_SECRET);
  } catch (err) {
    return res.status(400).send('Invalid or expired state parameter');
  }
  if (decodedState.action_id !== action_id) {
    return res.status(400).send('Mismatched action ID in state parameter');
  }
  const [action] = await getActions({ action_id }, true);
  if (!action) {
    return res.status(404).send('Action not found');
  }

  let metadata = await decryptMetadata(action.metadata);

  // Token exchange
  const redirectUri = `${process.env.DOMAIN_CLIENT}/api/actions/${action_id}/oauth/callback`;
  const body = new URLSearchParams({
    client_id: metadata.oauth_client_id,
    client_secret: metadata.oauth_client_secret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const tokenResp = await fetch(action.metadata.auth.client_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
  });

  if (!tokenResp.ok) {
    return res
      .status(tokenResp.status)
      .send(`Error exchanging code: ${await tokenResp.text()}`);
  }

  const tokenJson = await tokenResp.json();
  const { access_token, refresh_token, expires_in } = tokenJson;

  const updateData = {
    $set: {
      'metadata.oauth_access_token': access_token,
      'metadata.oauth_refresh_token': refresh_token,
    },
  };

  if (expires_in) {
    updateData.$set['metadata.oauth_token_expires_at'] = new Date(Date.now() + expires_in * 1000);
  }

  await updateAction({ action_id }, updateData);

  res.send('Authentication successful. You can close this window and return to your chat.');
});
module.exports = router;