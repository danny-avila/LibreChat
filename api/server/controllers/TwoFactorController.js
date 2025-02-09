const { logger } = require('~/config');
const { generateTOTPSecret, generateBackupCodes, verifyTOTP } = require('~/server/services/twoFactorService');
const { User, updateUser } = require('~/models');
const crypto = require('crypto');

const enable2FAController = async (req, res) => {
  const safeAppTitle = (process.env.APP_TITLE || 'LibreChat').replace(/\s+/g, '');
  try {
    const userId = req.user.id;
    const secret = generateTOTPSecret();
    const { plainCodes, codeObjects } = generateBackupCodes();

    const user = await User.findByIdAndUpdate(
      userId,
      { totpSecret: secret, backupCodes: codeObjects },
      { new: true },
    );

    const otpauthUrl = `otpauth://totp/${safeAppTitle}:${user.email}?secret=${secret}&issuer=${safeAppTitle}`;

    res.status(200).json({
      message: '2FA secret generated. Scan the QR code with your authenticator app and verify the token.',
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
    const user = await User.findById(userId);
    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: '2FA not initiated' });
    }
    if (token && verifyTOTP(user.totpSecret, token)) {
      return res.status(200).json({ message: 'Token is valid.' });
    } else if (backupCode) {
      const backupCodeInput = backupCode.trim();
      const hashedInput = crypto
        .createHash('sha256')
        .update(backupCodeInput)
        .digest('hex');
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
        return res.status(200).json({ message: 'Backup code is valid.' });
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
    const user = await User.findById(userId);
    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: '2FA not initiated' });
    }
    if (verifyTOTP(user.totpSecret, token)) {
      user.totpEnabled = true;
      await user.save();
      return res.status(200).json({ message: '2FA is now enabled.' });
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
    await User.findByIdAndUpdate(
      userId,
      { totpEnabled: false, totpSecret: '', backupCodes: [] },
      { new: true },
    );
    res.status(200).json({ message: '2FA has been disabled.' });
  } catch (err) {
    logger.error('[disable2FAController]', err);
    res.status(500).json({ message: err.message });
  }
};

const regenerateBackupCodesController = async (req, res) => {
  try {
    const userId = req.user.id;
    const { plainCodes, codeObjects } = generateBackupCodes();
    await User.findByIdAndUpdate(
      userId,
      { backupCodes: codeObjects },
      { new: true },
    );
    res.status(200).json({ message: 'Backup codes regenerated.', backupCodes: plainCodes,  backupCodesHash: codeObjects });
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