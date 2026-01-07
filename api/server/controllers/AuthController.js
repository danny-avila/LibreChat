const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const openIdClient = require('openid-client');
const { logger } = require('@librechat/data-schemas');
const { isEnabled, findOpenIDUser } = require('@librechat/api');
const {
  requestPasswordReset,
  setOpenIDAuthTokens,
  resetPassword,
  setAuthTokens,
  registerUser,
} = require('~/server/services/AuthService');
const {
  deleteAllUserSessions,
  getUserById,
  findSession,
  updateUser,
  findUser,
} = require('~/models');
const { getGraphApiToken } = require('~/server/services/GraphTokenService');
const { getOAuthReconnectionManager } = require('~/config');
const { getOpenIdConfig } = require('~/strategies');

const registrationController = async (req, res) => {
  try {
    const response = await registerUser(req.body);
    const { status, message } = response;
    res.status(status).send({ message });
  } catch (err) {
    logger.error('[registrationController]', err);
    return res.status(500).json({ message: err.message });
  }
};

const resetPasswordRequestController = async (req, res) => {
  try {
    const resetService = await requestPasswordReset(req);
    if (resetService instanceof Error) {
      return res.status(400).json(resetService);
    } else {
      return res.status(200).json(resetService);
    }
  } catch (e) {
    logger.error('[resetPasswordRequestController]', e);
    return res.status(400).json({ message: e.message });
  }
};

const resetPasswordController = async (req, res) => {
  try {
    const resetPasswordService = await resetPassword(
      req.body.userId,
      req.body.token,
      req.body.password,
    );
    if (resetPasswordService instanceof Error) {
      return res.status(400).json(resetPasswordService);
    } else {
      await deleteAllUserSessions({ userId: req.body.userId });
      return res.status(200).json(resetPasswordService);
    }
  } catch (e) {
    logger.error('[resetPasswordController]', e);
    return res.status(400).json({ message: e.message });
  }
};

const refreshController = async (req, res) => {
  const parsedCookies = req.headers.cookie ? cookies.parse(req.headers.cookie) : {};
  const token_provider = parsedCookies.token_provider;

  if (token_provider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    /** For OpenID users, read refresh token from session to avoid large cookie issues */
    const refreshToken = req.session?.openidTokens?.refreshToken || parsedCookies.refreshToken;

    if (!refreshToken) {
      return res.status(200).send('Refresh token not provided');
    }

    try {
      const openIdConfig = getOpenIdConfig();
      const tokenset = await openIdClient.refreshTokenGrant(openIdConfig, refreshToken);
      const claims = tokenset.claims();
      const { user, error, migration } = await findOpenIDUser({
        findUser,
        email: claims.email,
        openidId: claims.sub,
        idOnTheSource: claims.oid,
        strategyName: 'refreshController',
      });

      logger.debug(
        `[refreshController] findOpenIDUser result: user=${user?.email ?? 'null'}, error=${error ?? 'null'}, migration=${migration}, userOpenidId=${user?.openidId ?? 'null'}, claimsSub=${claims.sub}`,
      );

      if (error || !user) {
        logger.warn(
          `[refreshController] Redirecting to /login: error=${error ?? 'null'}, user=${user ? 'exists' : 'null'}`,
        );
        return res.status(401).redirect('/login');
      }

      // Handle migration: update user with openidId if found by email without openidId
      // Also handle case where user has mismatched openidId (e.g., after database switch)
      if (migration || user.openidId !== claims.sub) {
        const reason = migration ? 'migration' : 'openidId mismatch';
        await updateUser(user._id.toString(), {
          provider: 'openid',
          openidId: claims.sub,
        });
        logger.info(
          `[refreshController] Updated user ${user.email} openidId (${reason}): ${user.openidId ?? 'null'} -> ${claims.sub}`,
        );
      }

      const token = setOpenIDAuthTokens(tokenset, req, res, user._id.toString(), refreshToken);

      user.federatedTokens = {
        access_token: tokenset.access_token,
        id_token: tokenset.id_token,
        refresh_token: refreshToken,
        expires_at: claims.exp,
      };

      return res.status(200).send({ token, user });
    } catch (error) {
      logger.error('[refreshController] OpenID token refresh error', error);
      return res.status(403).send('Invalid OpenID refresh token');
    }
  }

  /** For non-OpenID users, read refresh token from cookies */
  const refreshToken = parsedCookies.refreshToken;
  if (!refreshToken) {
    return res.status(200).send('Refresh token not provided');
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await getUserById(payload.id, '-password -__v -totpSecret -backupCodes');
    if (!user) {
      return res.status(401).redirect('/login');
    }

    const userId = payload.id;

    if (process.env.NODE_ENV === 'CI') {
      const token = await setAuthTokens(userId, res);
      return res.status(200).send({ token, user });
    }

    /** Session with the hashed refresh token */
    const session = await findSession(
      {
        userId: userId,
        refreshToken: refreshToken,
      },
      { lean: false },
    );

    if (session && session.expiration > new Date()) {
      const token = await setAuthTokens(userId, res, session);

      // trigger OAuth MCP server reconnection asynchronously (best effort)
      try {
        void getOAuthReconnectionManager()
          .reconnectServers(userId)
          .catch((err) => {
            logger.error('[refreshController] Error reconnecting OAuth MCP servers:', err);
          });
      } catch (err) {
        logger.warn(`[refreshController] Cannot attempt OAuth MCP servers reconnection:`, err);
      }

      res.status(200).send({ token, user });
    } else if (req?.query?.retry) {
      // Retrying from a refresh token request that failed (401)
      res.status(403).send('No session found');
    } else if (payload.exp < Date.now() / 1000) {
      res.status(403).redirect('/login');
    } else {
      res.status(401).send('Refresh token expired or not found for this user');
    }
  } catch (err) {
    logger.error(`[refreshController] Invalid refresh token:`, err);
    res.status(403).send('Invalid refresh token');
  }
};

const graphTokenController = async (req, res) => {
  try {
    // Validate user is authenticated via Entra ID
    if (!req.user.openidId || req.user.provider !== 'openid') {
      return res.status(403).json({
        message: 'Microsoft Graph access requires Entra ID authentication',
      });
    }

    // Check if OpenID token reuse is active (required for on-behalf-of flow)
    if (!isEnabled(process.env.OPENID_REUSE_TOKENS)) {
      return res.status(403).json({
        message: 'SharePoint integration requires OpenID token reuse to be enabled',
      });
    }

    // Extract access token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Valid authorization token required',
      });
    }

    // Get scopes from query parameters
    const scopes = req.query.scopes;
    if (!scopes) {
      return res.status(400).json({
        message: 'Graph API scopes are required as query parameter',
      });
    }

    const accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix
    const tokenResponse = await getGraphApiToken(req.user, accessToken, scopes);

    res.json(tokenResponse);
  } catch (error) {
    logger.error('[graphTokenController] Failed to obtain Graph API token:', error);
    res.status(500).json({
      message: 'Failed to obtain Microsoft Graph token',
    });
  }
};

module.exports = {
  refreshController,
  registrationController,
  resetPasswordController,
  resetPasswordRequestController,
  graphTokenController,
};
