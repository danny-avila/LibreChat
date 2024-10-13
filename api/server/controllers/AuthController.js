const cookies = require('cookie');
const jwt = require('jsonwebtoken');
const {
  registerUser,
  resetPassword,
  setAuthTokens,
  requestPasswordReset,
} = require('~/server/services/AuthService');
const { hashToken } = require('~/server/utils/crypto');
const { Session, getUserById, findUser } = require('~/models');
const { logger } = require('~/config');
const { default: axios } = require('axios');
const { isOpenIDConfigured } = require('~/strategies/validators');

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
  } catch (e) {
    logger.error('[resetPasswordController]', e);
    return res.status(400).json({ message: e.message });
  }
};

const refreshController = async (req, res) => {
  const refreshToken = req.headers.cookie ? cookies.parse(req.headers.cookie).refreshToken : null;
  if (!refreshToken) {
    return res.status(200).send('Refresh token not provided');
  }

  try {
    if (isOpenIDConfigured()) {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.OPENID_CLIENT_ID || '',
        client_secret: process.env.OPENID_CLIENT_SECRET || '',
        scope: process.env.OPENID_SCOPE || 'openid profile email',
      });

      const response = await axios.post(
        process.env.OPENID_TOKEN_ENDPOINT_URI,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      const decodedToken = jwt.decode(response.data.id_token);
      const openidId = decodedToken?.sub;

      if (!openidId) {
        return res.status(401).send('Unable to retrieve user subject from token');
      }

      const user = await findUser({ openidId }, '-password -__v');

      if (!user) {
        return res.status(401).redirect('/login');
      }

      const userId = user._id;

      if (process.env.NODE_ENV === 'CI') {
        const token = await setAuthTokens(userId, res, response.data);
        return res.status(200).send({ token, user });
      }

      // Hash the refresh token
      const hashedToken = await hashToken(refreshToken);

      // Find the session with the hashed refresh token
      const session = await Session.findOne({ user: userId, refreshTokenHash: hashedToken });

      const isTokenExpired = (tokenExpiry) => {
        return tokenExpiry < Math.floor(Date.now() / 1000);
      };

      if (session && session.expiration > new Date()) {
        const token = await setAuthTokens(userId, res, response.data, session._id);
        res.status(200).send({ token, user });
      } else if (req?.query?.retry) {
        // Retrying from a refresh token request that failed (401)
        res.status(403).send('No session found');
      } else if (isTokenExpired(response.data.expires_in)) {
        res.status(403).redirect('/login');
      } else {
        res.status(401).send('Refresh token expired or not found for this user');
      }
    }
    else {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      const user = await getUserById(payload.id, '-password -__v');
      if (!user) {
        return res.status(401).redirect('/login');
      }

      const userId = payload.id;

      if (process.env.NODE_ENV === 'CI') {
        const token = await setAuthTokens(userId, res);
        return res.status(200).send({ token, user });
      }

      // Hash the refresh token
      const hashedToken = await hashToken(refreshToken);

      // Find the session with the hashed refresh token
      const session = await Session.findOne({ user: userId, refreshTokenHash: hashedToken });
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
