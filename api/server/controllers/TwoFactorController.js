const { webcrypto } = require('node:crypto');
const {
  generateTOTPSecret,
  generateBackupCodes,
  verifyTOTP,
} = require('~/server/services/twoFactorService');
const { updateUser, getUserById } = require('~/models');
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

const enable2FAController = async (req, res) => {
  const safeAppTitle = (process.env.APP_TITLE || 'LibreChat').replace(/\s+/g, '');

  try {
    const userId = req.user.id;
    const secret = generateTOTPSecret();
    const { plainCodes, codeObjects } = await generateBackupCodes();

    const user = await updateUser(
      userId,
      { totpSecret: secret, backupCodes: codeObjects },
    );

    const otpauthUrl = `otpauth://totp/${safeAppTitle}:${user.email}?secret=${secret}&issuer=${safeAppTitle}`;

    res.status(200).json({
      otpauthUrl,
      backupCodes: plainCodes,
    });
  } catch (err) {
    logger.error('[enable2FAController]', err);
    res.status(500).json({ message: err.message });
  }
};

const verify2FAController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, backupCode } = req.body;
    const user = await getUserById(userId);
    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: '2FA not initiated' });
    }

    if (token && (await verifyTOTP(user.totpSecret, token))) {
      return res.status(200).json();
    } else if (backupCode) {
      const backupCodeInput = backupCode.trim();
      const hashedInput = await hashBackupCode(backupCodeInput);
      const matchingCode = user.backupCodes.find(
        (codeObj) => codeObj.codeHash === hashedInput && codeObj.used === false,
      );

      if (matchingCode) {
        const updatedBackupCodes = user.backupCodes.map((codeObj) => {
          if (codeObj.codeHash === hashedInput && codeObj.used === false) {
            return { ...codeObj, used: true, usedAt: new Date() };
          }
          return codeObj;
        });

        await updateUser(user._id, { backupCodes: updatedBackupCodes });
        return res.status(200).json();
      }
    }

    return res.status(400).json({ message: 'Invalid token.' });
  } catch (err) {
    logger.error('[verify2FAController]', err);
    res.status(500).json({ message: err.message });
  }
};

const confirm2FAController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    const user = await getUserById(userId);

    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: '2FA not initiated' });
    }

    if (await verifyTOTP(user.totpSecret, token)) {
      return res.status(200).json();
    }

    return res.status(400).json({ message: 'Invalid token.' });
  } catch (err) {
    logger.error('[confirm2FAController]', err);
    res.status(500).json({ message: err.message });
  }
};

const disable2FAController = async (req, res) => {
  try {
    const userId = req.user.id;
    await updateUser(
      userId,
      { totpSecret: null, backupCodes: [] },
    );
    res.status(200).json();
  } catch (err) {
    logger.error('[disable2FAController]', err);
    res.status(500).json({ message: err.message });
  }
};

const regenerateBackupCodesController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plainCodes, codeObjects } = await generateBackupCodes();
    await updateUser(
      userId,
      {  backupCodes: codeObjects },
    );
    res.status(200).json({
      backupCodes: plainCodes,
      backupCodesHash: codeObjects,
    });
  } catch (err) {
    logger.error('[regenerateBackupCodesController]', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  enable2FAController,
  verify2FAController,
  confirm2FAController,
  disable2FAController,
  regenerateBackupCodesController,
};
