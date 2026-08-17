const { logger } = require('@librechat/data-schemas');
const {
  TWO_FACTOR_ENROLLMENT_REQUIRED_CODE,
  TWO_FACTOR_FEDERATED_LOGIN_BLOCKED_CODE,
} = require('librechat-data-provider');
const {
  clearCloudFrontCookies,
  hasPasswordResetSince,
  TOKEN_RETIREMENT_FIELDS,
  generateTwoFactorSetupToken,
  isTwoFactorEnrollmentRequired,
  isCredentialLoginBlockedByTwoFactorPolicy,
} = require('@librechat/api');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { getUserById, deleteAllUserSessions } = require('~/models');
const { setAuthTokens } = require('~/server/services/AuthService');

/**
 * Whether recovery revoked the password this request was authenticated with.
 *
 * The strategy compares the hash against a document it read beforehand, so a reset landing between
 * that read and the response revokes the password while this request still holds it. Every
 * credential below is stamped after the comparison, which puts it past `passwordResetAt` and leaves
 * no downstream cutoff able to retire it. Re-reading the stamp once the credential exists is what
 * orders the two: a reset later than this read is later than the mint as well, so the ordinary
 * retirement gates catch whatever this request handed back.
 */
const wasPasswordRevokedDuringLogin = async (user) => {
  const current = await getUserById(user._id.toString(), TOKEN_RETIREMENT_FIELDS);
  return hasPasswordResetSince(user.passwordResetAt, current?.passwordResetAt);
};

const refuseRevokedLogin = (res, user) => {
  logger.warn(
    `[loginController] Refused a login whose password was reset while it was in flight [userId: ${user._id}]`,
  );
  return res.status(401).json({ message: 'Invalid credentials' });
};

/** Drops the session the lost race had already opened, cookies included. */
const withdrawLoginSession = async (res, user) => {
  const userId = user._id.toString();
  await deleteAllUserSessions({ userId });
  res.clearCookie('refreshToken');
  res.clearCookie('token_provider');
  clearCloudFrontCookies(res, {
    userId,
    tenantId: user.tenantId ?? user.orgId,
    storageRegion: user.storageRegion,
  });
};

const loginController = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    /**
     * A recovered password can sit on a federated record that already has LibreChat 2FA. Issuing
     * the challenge first would let `/2fa/verify-temp` mint a session from that password and TOTP,
     * which is not the identity-provider path enforcement requires.
     */
    if (isCredentialLoginBlockedByTwoFactorPolicy(req.user)) {
      logger.warn(
        `[loginController] Refused a password login for a federated record under required 2FA [provider: ${req.user.provider}] [Request-IP: ${req.ip}]`,
      );
      return res.status(403).json({
        code: TWO_FACTOR_FEDERATED_LOGIN_BLOCKED_CODE,
        message: 'Sign in with your identity provider to continue.',
      });
    }

    if (req.user.twoFactorEnabled) {
      const tempToken = generate2FATempToken(req.user._id);
      if (await wasPasswordRevokedDuringLogin(req.user)) {
        return refuseRevokedLogin(res, req.user);
      }
      return res.status(200).json({ twoFAPending: true, tempToken });
    }

    if (isTwoFactorEnrollmentRequired(req.user)) {
      clearCloudFrontCookies(res, {
        userId: req.user._id.toString(),
        tenantId: req.user.tenantId ?? req.user.orgId,
        storageRegion: req.user.storageRegion,
      });
      const tempToken = generateTwoFactorSetupToken(
        req.user._id.toString(),
        process.env.JWT_SECRET,
      );
      if (await wasPasswordRevokedDuringLogin(req.user)) {
        return refuseRevokedLogin(res, req.user);
      }
      return res.status(200).json({
        code: TWO_FACTOR_ENROLLMENT_REQUIRED_CODE,
        twoFAPending: true,
        twoFASetupRequired: true,
        tempToken,
      });
    }

    const { password: _p, totpSecret: _t, __v, ...user } = req.user;
    user.id = user._id.toString();

    const token = await setAuthTokens(req.user._id, res, null, req);
    if (await wasPasswordRevokedDuringLogin(req.user)) {
      await withdrawLoginSession(res, req.user);
      return refuseRevokedLogin(res, req.user);
    }

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[loginController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  loginController,
};
