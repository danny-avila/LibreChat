const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const { confirmTwoFactorSetup } = require('@librechat/api');
const {
  verifyTOTP,
  getTOTPSecret,
  verifyBackupCode,
} = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById, updateUser } = require('~/models');

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
      logger.error('Failed to verify temporary token:', err);
      return res.status(401).json({ message: 'Invalid or expired temporary token' });
    }

    const user = await getUserById(payload.userId, '+totpSecret +backupCodes');
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

    const userData = user.toObject ? user.toObject() : { ...user };
    delete userData.__v;
    delete userData.password;
    delete userData.totpSecret;
    delete userData.backupCodes;
    userData.id = user._id.toString();

    const authToken = await setAuthTokens(user._id, res, null, req);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[verify2FAWithTempToken]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/**
 * Confirms required 2FA enrollment after a setup token has been validated.
 */
const confirm2FASetupWithTempToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid or expired two-factor setup token' });
    }

    const result = await confirmTwoFactorSetup(userId, req.body?.token, {
      getUserById,
      getTOTPSecret,
      verifyTOTP,
      updateUser,
    });
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    const userData = result.user.toObject ? result.user.toObject() : { ...result.user };
    delete userData.__v;
    delete userData.password;
    delete userData.totpSecret;
    delete userData.backupCodes;
    delete userData.pendingTotpSecret;
    delete userData.pendingBackupCodes;
    userData.id = result.user._id.toString();
    userData.twoFactorEnabled = true;

    const authToken = await setAuthTokens(result.user._id, res, null, req);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[confirm2FASetupWithTempToken]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = { verify2FAWithTempToken, confirm2FASetupWithTempToken };
