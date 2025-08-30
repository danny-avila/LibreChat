const { logger, signPayload } = require('@librechat/data-schemas');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');

/**
 * Generates admin-specific JWT token with isAdmin claim
 * @param {Object} user - User object from database
 * @returns {Promise<string>} - JWT token
 */
const generateAdminToken = async (user) => {
  if (!user) {
    throw new Error('No user provided');
  }

  let expires = 1000 * 60 * 15; // 15 minutes default

  if (process.env.SESSION_EXPIRY !== undefined && process.env.SESSION_EXPIRY !== '') {
    try {
      const evaluated = eval(process.env.SESSION_EXPIRY);
      if (evaluated) {
        expires = evaluated;
      }
    } catch (error) {
      logger.warn('Invalid SESSION_EXPIRY expression, using default:', error);
    }
  }

  return await signPayload({
    payload: {
      id: user._id,
      username: user.username,
      provider: user.provider,
      email: user.email,
      isAdmin: true, // Admin-specific claim
    },
    secret: process.env.JWT_SECRET,
    expirationTime: expires / 1000,
  });
};

/**
 * Admin login controller - handles authentication for admin users
 * Returns admin-specific JWT with isAdmin claim
 */
const adminLoginController = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // User role validation is already done in requireAdminAuth middleware

    // Handle 2FA if enabled
    if (req.user.twoFactorEnabled) {
      const tempToken = generate2FATempToken(req.user._id);
      return res.status(200).json({ twoFAPending: true, tempToken });
    }

    const { password: _p, totpSecret: _t, __v, ...user } = req.user;
    user.id = user._id.toString();

    // Generate admin-specific token
    const token = await generateAdminToken(req.user);

    // Set standard auth cookies (refreshToken, etc.)
    await setAuthTokens(req.user._id, res);

    return res.status(200).send({ token, user, isAdmin: true });
  } catch (err) {
    logger.error('[adminLoginController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  adminLoginController,
};
