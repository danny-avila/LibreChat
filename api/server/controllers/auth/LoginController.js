const { logger } = require('@librechat/data-schemas');
const { TWO_FACTOR_ENROLLMENT_REQUIRED_CODE } = require('librechat-data-provider');
const {
  clearCloudFrontCookies,
  generateTwoFactorSetupToken,
  isTwoFactorEnrollmentRequired,
} = require('@librechat/api');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');

const loginController = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (req.user.twoFactorEnabled) {
      const tempToken = generate2FATempToken(req.user._id);
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

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[loginController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  loginController,
};
