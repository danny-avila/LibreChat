const {
  verifyTOTP,
  verifyBackupCode,
  generateTOTPSecret,
  generateBackupCodes,
  getTOTPSecret,
} = require('~/server/services/twoFactorService');
const { updateUser, getUserById } = require('~/models');
const { logger } = require('~/config');
const { encryptV2 } = require('~/server/utils/crypto');

const enable2FAController = async (req, res) => {
  const safeAppTitle = (process.env.APP_TITLE || 'LibreChat').replace(/\s+/g, '');

  try {
    const userId = req.user.id;
    const secret = generateTOTPSecret();
    const { plainCodes, codeObjects } = await generateBackupCodes();

    const encryptedSecret = await encryptV2(secret);
    const user = await updateUser(userId, { totpSecret: encryptedSecret, backupCodes: codeObjects });

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

    // Retrieve the plain TOTP secret using getTOTPSecret.
    const secret = await getTOTPSecret(user.totpSecret);

    if (token && (await verifyTOTP(secret, token))) {
      return res.status(200).json();
    } else if (backupCode) {
      const verified = await verifyBackupCode({ user, backupCode });
      if (verified) {
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

    // Retrieve the plain TOTP secret using getTOTPSecret.
    const secret = await getTOTPSecret(user.totpSecret);

    if (await verifyTOTP(secret, token)) {
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
    await updateUser(userId, { totpSecret: null, backupCodes: [] });
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
    await updateUser(userId, { backupCodes: codeObjects });
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
