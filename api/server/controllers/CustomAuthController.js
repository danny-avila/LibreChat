const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const openIdClient = require('openid-client');
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const {
  requestPasswordReset,
  setOpenIDAuthTokens,
  resetPassword,
  setAuthTokens,
  registerUser,
} = require('~/server/services/AuthService');
const { findUser, getUserById, deleteAllUserSessions, findSession } = require('~/models');
const { getOpenIdConfig } = require('~/strategies');
const { refreshBackendToken, setCustomBackendTokens } = require('~/server/services/CustomBackendAuthService');

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
      return res.status(200).json(resetPasswordService);
    }
  } catch (err) {
    logger.error('[resetPasswordController]', err);
    return res.status(400).json({ message: err.message });
  }
};

const refreshController = async (req, res) => {
  const refreshToken = req.headers.cookie ? cookies.parse(req.headers.cookie).refreshToken : null;
  const accessToken = req.headers.cookie ? cookies.parse(req.headers.cookie).refreshToken : null;
  const token_provider = req.headers.cookie
    ? cookies.parse(req.headers.cookie).token_provider
    : null;
  
  logger.debug('[refreshController] Refresh request received:', {
    hasRefreshToken: !!refreshToken,
    tokenProvider: token_provider,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
  });
  
  if (!refreshToken) {
    logger.debug('[refreshController] No refresh token provided');
    return res.status(200).send('Refresh token not provided');
  }

  // Handle custom backend token refresh - simple pass-through approach
  if (token_provider === 'custom-backend') {
    try {
      // For custom backend, we don't actually refresh tokens since the backend doesn't support it
      // Instead, we simply validate that we have a user and return the same token
      logger.debug('[refreshController] Custom backend refresh - simple pass-through');

      const { token, refreshToken: newRefreshToken } = await refreshBackendToken(refreshToken)

      // Try to get user info from the backend using the refresh token
      const { getUserInfoFromBackend } = require('~/strategies/customBackendStrategy');
      
      // Get user email from cookies if available, otherwise decode from refresh token
      const userInfoResult = await getUserInfoFromBackend(refreshToken);
      
      if (userInfoResult.success) {
        userEmail = userInfoResult.user.email;
      } else {
        logger.warn('[refreshController] Could not get user email from token or backend');
        return res.status(403).send('Token validation failed');
      }

      // Find user in LibreChat database
      const user = await findUser({ email: userEmail });
      if (!user) {
        logger.warn('[refreshController] User not found:', userEmail);
        return res.status(401).redirect('/login');
      }

      logger.debug('Found user in mongoose DB:', {
        user: user,
      });

      // Generate a new LibreChat JWT token instead of returning the backend token
      const librechatToken = await setAuthTokens(user._id, res);

      setCustomBackendTokens(token, newRefreshToken, res, 86400, userEmail);

      return res.status(200).send({ 
        token: librechatToken, // Return LibreChat JWT token for frontend use
        user: user
      });

    } catch (error) {
      logger.error('[refreshController] Custom backend refresh error:', error);
      return res.status(403).send('Token refresh failed');
    }
  }

  // Handle OpenID token refresh
  if (token_provider === 'openid' && isEnabled(process.env.OPENID_REUSE_TOKENS) === true) {
    try {
      const openIdConfig = getOpenIdConfig();
      const tokenset = await openIdClient.refreshTokenGrant(openIdConfig, refreshToken);
      const claims = tokenset.claims();
      const user = await findUser({ email: claims.email });
      if (!user) {
        return res.status(401).redirect('/login');
      }
      const token = setOpenIDAuthTokens(tokenset, res);
      return res.status(200).send({ token, user });
    } catch (error) {
      logger.error('[refreshController] OpenID token refresh error', error);
      return res.status(403).send('Invalid OpenID refresh token');
    }
  }

  // Handle LibreChat JWT token refresh
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await getUserById(payload.id, '-password -__v -totpSecret');
    if (!user) {
      return res.status(401).redirect('/login');
    }

    const userId = payload.id;

    if (process.env.NODE_ENV === 'CI') {
      const token = await setAuthTokens(userId, res);
      return res.status(200).send({ token, user });
    }

    // Find the session with the hashed refresh token
    const session = await findSession({
      userId: userId,
      refreshToken: refreshToken,
    });

    if (session && session.expiration > new Date()) {
      const token = await setAuthTokens(userId, res, session._id);
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
    logger.error(`[refreshController] Refresh token: ${refreshToken}`, err);
    res.status(403).send('Invalid refresh token');
  }
};

module.exports = {
  refreshController,
  registrationController,
  resetPasswordController,
  resetPasswordRequestController,
};
