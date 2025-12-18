const { encryptV3, logger } = require('@librechat/data-schemas');
const {
  generateBackupCodes,
  generateTOTPSecret,
  verifyBackupCode,
  getTOTPSecret,
  verifyTOTP,
} = require('~/server/services/twoFactorService');
const { getUserById, updateUser } = require('~/models');

const safeAppTitle = (process.env.APP_TITLE || 'Vicktoria AI').replace(/\s+/g, '');

/**
 * Enable 2FA for the user by generating a new TOTP secret and backup codes.
 * The secret is encrypted and stored, and 2FA is marked as disabled until confirmed.
 */
const enable2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const secret = generateTOTPSecret();
    const { plainCodes, codeObjects } = await generateBackupCodes();

    // Encrypt the secret with v3 encryption before saving.
    const encryptedSecret = encryptV3(secret);

    // Update the user record: store the secret & backup codes and set twoFactorEnabled to false.
    const user = await updateUser(userId, {
      totpSecret: encryptedSecret,
      backupCodes: codeObjects,
      twoFactorEnabled: false,
    });

    const otpauthUrl = `otpauth://totp/${safeAppTitle}:${user.email}?secret=${secret}&issuer=${safeAppTitle}`;

    return res.status(200).json({ otpauthUrl, backupCodes: plainCodes });
  } catch (err) {
    logger.error('[enable2FA]', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Verify a 2FA code (either TOTP or backup code) during setup.
 */
const verify2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, backupCode } = req.body;
    const user = await getUserById(userId, '_id totpSecret backupCodes');

    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: '2FA not initiated' });
    }

    const secret = await getTOTPSecret(user.totpSecret);
    let isVerified = false;

    if (token) {
      isVerified = await verifyTOTP(secret, token);
    } else if (backupCode) {
      isVerified = await verifyBackupCode({ user, backupCode });
    }

    if (isVerified) {
      return res.status(200).json();
    }
    return res.status(400).json({ message: 'Invalid token or backup code.' });
  } catch (err) {
    logger.error('[verify2FA]', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Confirm and enable 2FA after a successful verification.
 */
const confirm2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;
    const user = await getUserById(userId, '_id totpSecret');

    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: '2FA not initiated' });
    }

    const secret = await getTOTPSecret(user.totpSecret);
    if (await verifyTOTP(secret, token)) {
      await updateUser(userId, { twoFactorEnabled: true });
      return res.status(200).json();
    }
    return res.status(400).json({ message: 'Invalid token.' });
  } catch (err) {
    logger.error('[confirm2FA]', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Disable 2FA by clearing the stored secret and backup codes.
 * Requires verification with either TOTP token or backup code if 2FA is fully enabled.
 */
const disable2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, backupCode } = req.body;
    const user = await getUserById(userId, '_id totpSecret backupCodes');

    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: '2FA is not setup for this user' });
    }

    if (user.twoFactorEnabled) {
      const secret = await getTOTPSecret(user.totpSecret);
      let isVerified = false;

      if (token) {
        isVerified = await verifyTOTP(secret, token);
      } else if (backupCode) {
        isVerified = await verifyBackupCode({ user, backupCode });
      } else {
        return res
          .status(400)
          .json({ message: 'Either token or backup code is required to disable 2FA' });
      }

      if (!isVerified) {
        return res.status(401).json({ message: 'Invalid token or backup code' });
      }
    }
    await updateUser(userId, { totpSecret: null, backupCodes: [], twoFactorEnabled: false });
    return res.status(200).json();
  } catch (err) {
    logger.error('[disable2FA]', err);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Regenerate backup codes for the user.
 */
const regenerateBackupCodes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plainCodes, codeObjects } = await generateBackupCodes();
    await updateUser(userId, { backupCodes: codeObjects });
    return res.status(200).json({
      backupCodes: plainCodes,
      backupCodesHash: codeObjects,
    });
  } catch (err) {
    logger.error('[regenerateBackupCodes]', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  enable2FA,
  verify2FA,
  confirm2FA,
  disable2FA,
  regenerateBackupCodes,
};
