const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { logger } = require('~/config');

const loginController = async (req, res) => {
  try {
    // Add debug logging to see if this function is called
    logger.info(`[loginController] Login attempt started for user: ${req.user?._id}`);
    
    if (!req.user) {
      logger.warn('[loginController] No user found in request');
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (req.user.twoFactorEnabled) {
      const tempToken = generate2FATempToken(req.user._id);
      return res.status(200).json({ twoFAPending: true, tempToken });
    }

    const { password: _p, totpSecret: _t, __v, ...user } = req.user;
    user.id = user._id.toString();

    const token = await setAuthTokens(req.user._id, res);

    logger.info(`[loginController] Login successful for user: ${req.user._id}`);
    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[loginController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  loginController,
};
