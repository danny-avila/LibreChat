const express = require('express');
const jwt = require('jsonwebtoken');
const { getAccessToken } = require('~/server/services/TokenService');
const { logger, getFlowStateManager } = require('~/config');
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
  let identifier = action_id;
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

    const tokenData = await getAccessToken({
      code,
      userId: decodedState.user,
      identifier,
      client_url: flowState.metadata.client_url,
      redirect_uri: flowState.metadata.redirect_uri,
      /** Encrypted values */
      encrypted_oauth_client_id: flowState.metadata.encrypted_oauth_client_id,
      encrypted_oauth_client_secret: flowState.metadata.encrypted_oauth_client_secret,
    });
    await flowManager.completeFlow(identifier, 'oauth', tokenData);
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
