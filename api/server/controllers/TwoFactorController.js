const { logger } = require('~/config');
const { generateTOTPSecret, generateBackupCodes, verifyTOTP } = require('~/server/services/twoFactorService');
const { User } = require('~/models');

const enable2FAController = async (req, res) => {
  const safeAppTitle = (process.env.APP_TITLE || 'LibreChat').replace(/\s+/g, '');
  try {
    const userId = req.user.id;
    const secret = generateTOTPSecret();
    const { plainCodes, hashedCodes } = generateBackupCodes();

    const user = await User.findByIdAndUpdate(
      userId,
      { totpSecret: secret, backupCodes: hashedCodes },
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
    const { token } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.totpSecret) {
      return res.status(400).json({ message: '2FA not initiated' });
    }
    if (verifyTOTP(user.totpSecret, token)) {
      return res.status(200).json({ message: 'Token is valid.' });
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
    const { plainCodes, hashedCodes } = generateBackupCodes();
    await User.findByIdAndUpdate(
      userId,
      { backupCodes: hashedCodes },
      { new: true },
    );
    res.status(200).json({ message: 'Backup codes regenerated.', backupCodes: plainCodes });
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