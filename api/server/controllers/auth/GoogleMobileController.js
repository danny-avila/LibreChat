const { logger } = require('@librechat/data-schemas');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const verifyGoogleMobileIdentity = require('~/server/services/auth/verifyGoogleMobileIdentity');
const resolveSocialLogin = require('~/server/services/auth/resolveSocialLogin');

const googleMobileController = async (req, res) => {
  try {
    const { idToken } = req.body ?? {};
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    const identity = await verifyGoogleMobileIdentity(idToken);
    const userRecord = await resolveSocialLogin('google', identity);

    if (userRecord.twoFactorEnabled) {
      const tempToken = generate2FATempToken(userRecord._id);
      return res.status(200).json({ twoFAPending: true, tempToken });
    }

    const {
      password: _p,
      totpSecret: _t,
      __v,
      ...user
    } = userRecord.toObject ? userRecord.toObject() : userRecord;
    user.id = user._id.toString();

    const token = await setAuthTokens(userRecord._id, res);
    return res.status(200).json({ token, user });
  } catch (err) {
    logger.error('[googleMobileController]', err);

    if (
      err?.message === 'Google ID token is required' ||
      err?.message === 'Missing Google mobile client ID configuration' ||
      err?.message === 'Invalid Google token payload'
    ) {
      return res.status(400).json({ message: err.message });
    }

    if (
      err?.message?.includes('Wrong recipient') ||
      err?.message?.includes('Token used too late') ||
      err?.message?.includes('Invalid token signature')
    ) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    if (err?.code) {
      return res.status(403).json({
        message: err.message || 'Google sign-in failed',
        provider: err.provider,
      });
    }

    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  googleMobileController,
};
