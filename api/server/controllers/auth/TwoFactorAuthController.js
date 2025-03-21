const jwt = require('jsonwebtoken');
const {
  verifyTOTP,
  verifyBackupCode,
  getTOTPSecret,
} = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById } = require('~/models/userMethods');
const { logger } = require('~/config');

/**
 * Verifies the 2FA code during login using a temporary token.
 */
const verify2FAWithTempToken = async (req, res) => {
  try {
    const { tempToken, token, backupCode } = req.body;
    if (!tempToken) {
      return res.status(400).json({ message: 'Missing temporary token' });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired temporary token' });
    }

    const user = await getUserById(payload.userId);
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is not enabled for this user' });
    }

    const secret = await getTOTPSecret(user.totpSecret);
    let isVerified = false;
    if (token) {
      isVerified = await verifyTOTP(secret, token);
    } else if (backupCode) {
      isVerified = await verifyBackupCode({ user, backupCode });
    }

    if (!isVerified) {
      return res.status(401).json({ message: 'Invalid 2FA code or backup code' });
    }

    // Prepare user data to return (omit sensitive fields).
    const userData = user.toObject ? user.toObject() : { ...user };
    delete userData.password;
    delete userData.__v;
    delete userData.totpSecret;
    userData.id = user._id.toString();

    const authToken = await setAuthTokens(user._id, res);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[verify2FAWithTempToken]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = { verify2FAWithTempToken };
