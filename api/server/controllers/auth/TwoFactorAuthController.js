const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { verifyTOTP } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById } = require('~/models');
const { logger } = require('~/config');

const verify2FA = async (req, res) => {
  try {
    const { tempToken, token, backupCode } = req.body;
    if (!tempToken) {
      return res.status(400).json({ message: 'Missing temporary token' });
    }
    // Verify the temporary token.
    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_2FA_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired temporary token' });
    }

    const user = await getUserById(payload.userId);
    if (!user || !user.totpEnabled) {
      return res.status(400).json({ message: '2FA is not enabled for this user' });
    }
    let verified = false;
    if (token && verifyTOTP(user.totpSecret, token)) {
      verified = true;
    } else if (backupCode) {
      const hashedInput = crypto.createHash('sha256').update(backupCode).digest('hex');
      if (user.backupCodes && user.backupCodes.includes(hashedInput)) {
        verified = true;
        // Remove the used backup code.
        user.backupCodes = user.backupCodes.filter(code => code !== hashedInput);
        await user.save();
      }
    }
    if (!verified) {
      return res.status(401).json({ message: 'Invalid 2FA code or backup code' });
    }
    // 2FA passed: generate full auth tokens.
    const { password: _, __v, ...userData } = user.toObject ? user.toObject() : user;
    userData.id = user._id.toString();
    const authToken = await setAuthTokens(user._id, res);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[verify2FA]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = { verify2FA };