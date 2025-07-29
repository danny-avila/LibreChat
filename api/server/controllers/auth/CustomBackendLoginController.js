const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { setCustomBackendTokens } = require('~/server/services/CustomBackendAuthService');
const { logger } = require('~/config');

const customBackendLoginController = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if 2FA is enabled (you might need to check with your backend)
    if (req.user.twoFactorEnabled) {
      const tempToken = generate2FATempToken(req.user._id);
      return res.status(200).json({ twoFAPending: true, tempToken });
    }

    const { password: _p, totpSecret: _t, __v, backendAccessToken, backendRefreshToken, ...user } = req.user;
    user.id = user._id.toString();

    // Use backend tokens if available, otherwise fall back to LibreChat tokens
    let token;
    if (backendAccessToken && backendRefreshToken) {
      token = setCustomBackendTokens(backendAccessToken, backendRefreshToken, res, 86400, req.user.email);
    } else {
      token = await setAuthTokens(req.user._id, res);
    }

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[customBackendLoginController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  customBackendLoginController,
};
