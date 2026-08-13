const { logger } = require('@librechat/data-schemas');
const {
  clearCloudFrontCookies,
  confirmTwoFactorSetup,
  finalizeTwoFactorSetup,
  TOKEN_RETIREMENT_FIELDS,
  acknowledgeTwoFactorSetup,
  sanitizeUserForResponse,
  verifyTwoFactorLoginChallengeToken,
  isEnrollmentSupersededByRecovery,
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
const { getUserById, updateTwoFactorEnrollment, deleteAllUserSessions } = require('~/models');

const sanitizeUser = (user) => ({
  ...sanitizeUserForResponse(user),
  id: user._id.toString(),
});

/**
 * Undoes the session hand-off `finalize2FASetup` had already started, leaving the promoted
 * enrollment in place. The refresh session is dropped server side, so the cookie this response
 * still carries buys nothing, and the access token is simply never handed back.
 */
const revokeFinalizedSession = async (res, user, userId) => {
  await deleteAllUserSessions({ userId });
  res.clearCookie('refreshToken');
  res.clearCookie('token_provider');
  clearCloudFrontCookies(res, {
    userId,
    tenantId: user.tenantId ?? user.orgId,
    storageRegion: user.storageRegion,
  });
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
    /**
     * Sessions opened before enrollment were only held back by `twoFactorEnabled` being false.
     * Promotion lifts that block, so drop them before minting the enrolled session; otherwise a
     * pre-enrollment refresh token could be exchanged for access without ever presenting a code.
     */
    await deleteAllUserSessions({ userId: result.user._id.toString() });
    const authToken = await setAuthTokens(result.user._id, res, null, req);

    /**
     * Recovery clears the staged enrollment, so a reset that lands before the promotion above loses
     * its compare-and-swap. One that lands in the gap between the promotion and this line does not,
     * and the session just minted postdates `passwordResetAt`, so no downstream gate would retire
     * it. Re-read the cutoff and withdraw the hand-off when recovery won that gap.
     */
    const retirement = await getUserById(userId, TOKEN_RETIREMENT_FIELDS);
    if (
      isEnrollmentSupersededByRecovery(result.user.twoFactorEnrolledAt, retirement?.passwordResetAt)
    ) {
      await revokeFinalizedSession(res, result.user, userId);
      return res
        .status(401)
        .json({ message: 'Password was reset during setup, please sign in again' });
    }

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
