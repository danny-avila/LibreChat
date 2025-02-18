const jwt = require('jsonwebtoken');
const { verifyTOTP, verifyBackupCode, getTOTPSecret } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById } = require('~/models/userMethods');
const { logger } = require('~/config');

const verify2FA = async (req, res) => {
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
    // Ensure that the user exists and has backup codes (i.e. 2FA enabled)
    if (!user || !(user.backupCodes && user.backupCodes.length > 0)) {
      return res.status(400).json({ message: '2FA is not enabled for this user' });
    }

    // Use the new getTOTPSecret function to retrieve (and decrypt if necessary) the TOTP secret.
    const secret = await getTOTPSecret(user.totpSecret);

    let verified = false;
    if (token && (await verifyTOTP(secret, token))) {
    // if (token && (await verifyTOTP(user.totpSecret, token))) {
      verified = true;
    } else if (backupCode) {
      verified = await verifyBackupCode({ user, backupCode });
    }

    if (!verified) {
      return res.status(401).json({ message: 'Invalid 2FA code or backup code' });
    }

    // Prepare user data for response.
    // If the user is a plain object (from lean queries), we create a shallow copy.
    const userData = user.toObject ? user.toObject() : { ...user };
    // Remove sensitive fields.
    delete userData.password;
    delete userData.__v;
    delete userData.totpSecret;
    userData.id = user._id.toString();

    const authToken = await setAuthTokens(user._id, res);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[verify2FA]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = { verify2FA };
