const axios = require('axios');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createToken, findToken, updateToken } = require('~/models/Token');
const { encryptV2, decryptV2 } = require('~/server/utils/crypto');
const { logger, getFlowStateManager } = require('~/config');
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
    const token = await encryptV2(access_token);
    const refreshToken = await encryptV2(refresh_token);
    const tokenData = {
      token,
      identifier,
      type: 'oauth',
      userId: decodedState.user,
      expiresIn: parseInt(expires_in, 10) || 3600,
      metadata: {
        refreshToken,
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

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
          <style>
            body {
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont;
              background-color: rgb(249, 250, 251);
              margin: 0;
              padding: 2rem;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
            }
            .card {
              background-color: white;
              border-radius: 0.5rem;
              padding: 2rem;
              max-width: 28rem;
              width: 100%;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
              text-align: center;
            }
            .heading {
              color: rgb(17, 24, 39);
              font-size: 1.875rem;
              font-weight: 700;
              margin: 0 0 1rem;
            }
            .description {
              color: rgb(75, 85, 99);
              font-size: 0.875rem;
              margin: 0.5rem 0;
            }
            .countdown {
              color: rgb(99, 102, 241);
              font-weight: 500;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="heading">Authentication Successful</h1>
            <p class="description">
              Your authentication was successful. This window will close in 
              <span class="countdown" id="countdown">3</span> seconds.
            </p>
          </div>
          <script>
            let secondsLeft = 3;
            const countdownElement = document.getElementById('countdown');
            
            const countdown = setInterval(() => {
              secondsLeft--;
              countdownElement.textContent = secondsLeft;
              
              if (secondsLeft <= 0) {
                clearInterval(countdown);
                window.close();
              }
            }, 1000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('Error in OAuth callback:', error);
    await flowManager.failFlow(identifier, 'oauth', error);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

module.exports = router;
