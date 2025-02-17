const jwt = require('jsonwebtoken');
const { webcrypto } = require('node:crypto');
const { verifyTOTP } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById, updateUser } = require('~/models');
const { logger } = require('~/config');

/**
 * Computes SHA-256 hash for the given input using WebCrypto
 * @param {string} input
 * @returns {Promise<string>} - Hex hash string
 */
const hashBackupCode = async (input) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await webcrypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

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

    let verified = false;

    if (token && (await verifyTOTP(user.totpSecret, token))) {
      verified = true;
    } else if (backupCode) {
      const hashedInput = await hashBackupCode(backupCode.trim());
      const matchingCode = user.backupCodes.find(
        (codeObj) => codeObj.codeHash === hashedInput && !codeObj.used,
      );

      if (matchingCode) {
        verified = true;
        const updatedBackupCodes = user.backupCodes.map((codeObj) =>
          codeObj.codeHash === hashedInput && !codeObj.used
            ? { ...codeObj, used: true, usedAt: new Date() }
            : codeObj,
        );

        await updateUser(user._id, { backupCodes: updatedBackupCodes });
      }
    }

    if (!verified) {
      return res.status(401).json({ message: 'Invalid 2FA code or backup code' });
    }

    // Prepare user data for response.
    // If the user is a plain object (from lean queries), we create a shallow copy.
    const userData = user.toObject ? user.toObject() : { ...user };
    // Remove sensitive fields
    delete userData.password;
    delete userData.__v;
    delete userData.totpSecret; // Ensure totpSecret is not returned
    userData.id = user._id.toString();

    const authToken = await setAuthTokens(user._id, res);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[verify2FA]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = { verify2FA };
