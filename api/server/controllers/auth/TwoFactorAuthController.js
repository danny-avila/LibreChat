const { logger } = require('@librechat/data-schemas');
const {
  confirmTwoFactorSetup,
  finalizeTwoFactorSetup,
  acknowledgeTwoFactorSetup,
  verifyTwoFactorLoginChallengeToken,
  generateTwoFactorSetupAcknowledgementToken,
  generateTwoFactorSetupFinalizationToken,
} = require('@librechat/api');
const {
  verifyTOTP,
  getTOTPSecret,
  verifyBackupCode,
  generateBackupCodes,
} = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById, updateTwoFactorEnrollment } = require('~/models');

const sanitizeUser = (user) => {
  const userData = user.toObject ? user.toObject() : { ...user };
  delete userData.__v;
  delete userData.password;
  delete userData.totpSecret;
  delete userData.backupCodes;
  delete userData.pendingTotpSecret;
  delete userData.pendingBackupCodes;
  delete userData.twoFactorAcknowledgementNonceHash;
  delete userData.twoFactorFinalizationNonceHash;
  userData.id = user._id.toString();
  return userData;
};

const enrollmentDependencies = {
  getUserById,
  getTOTPSecret,
  verifyTOTP,
  generateBackupCodes,
  updateTwoFactorEnrollment,
};

/**
 * Verifies the 2FA code during login using a temporary token.
 */
const verify2FAWithTempToken = async (req, res) => {
  try {
    const { tempToken, token, backupCode } = req.body;
    if (!tempToken) {
      return res.status(400).json({ message: 'Missing temporary token' });
    }

    const userId = verifyTwoFactorLoginChallengeToken(tempToken, process.env.JWT_SECRET);
    if (!userId) {
      return res.status(401).json({ message: 'Invalid or expired temporary token' });
    }

    const user = await getUserById(userId, '+totpSecret +backupCodes');
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

    const userData = sanitizeUser(user);

    const authToken = await setAuthTokens(user._id, res, null, req);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[verify2FAWithTempToken]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/**
 * Stages required 2FA enrollment after a setup token has been validated. Returns the deliverable
 * backup codes and an acknowledgement credential; 2FA is not enabled and no session is created.
 */
const confirm2FASetupWithTempToken = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid or expired two-factor setup token' });
    }

    const result = await confirmTwoFactorSetup(userId, req.body?.token, enrollmentDependencies);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    const acknowledgementToken = generateTwoFactorSetupAcknowledgementToken(
      userId,
      result.acknowledgementNonce,
      process.env.JWT_SECRET,
    );
    return res.status(200).json({ backupCodes: result.plainCodes, acknowledgementToken });
  } catch (err) {
    logger.error('[confirm2FASetupWithTempToken]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/**
 * Consumes the one-time acknowledgement nonce and issues a finalization credential.
 */
const acknowledge2FASetup = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res
        .status(401)
        .json({ message: 'Invalid or expired two-factor acknowledgement token' });
    }

    const result = await acknowledgeTwoFactorSetup(
      userId,
      req.twoFactorEnrollmentNonce,
      enrollmentDependencies,
    );
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    const finalizationToken = generateTwoFactorSetupFinalizationToken(
      userId,
      result.finalizationNonce,
      process.env.JWT_SECRET,
    );
    return res.status(200).json({ finalizationToken });
  } catch (err) {
    logger.error('[acknowledge2FASetup]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

/**
 * Promotes the pending enrollment and only then creates the authenticated session.
 */
const finalize2FASetup = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid or expired two-factor finalization token' });
    }

    const result = await finalizeTwoFactorSetup(
      userId,
      req.twoFactorEnrollmentNonce,
      enrollmentDependencies,
    );
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    const userData = sanitizeUser(result.user);
    const authToken = await setAuthTokens(result.user._id, res, null, req);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[finalize2FASetup]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  verify2FAWithTempToken,
  confirm2FASetupWithTempToken,
  acknowledge2FASetup,
  finalize2FASetup,
};
