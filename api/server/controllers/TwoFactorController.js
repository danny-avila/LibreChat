const { logger } = require('~/config');
const { generateTOTPSecret, generateBackupCodes, verifyTOTP } = require('~/server/services/twoFactorService');
const { User } = require('~/models');

// Remove any spaces from the app title.
const safeAppTitle = (process.env.APP_TITLE || 'LibreChat').replace(/\s+/g, '');

/**
 * Enable 2FA: generate a secret and backup codes.
 * The secret is stored in the user record, but 2FA isn't active until the user confirms.
 * Backup codes are provided once (in plaintext) and then only stored as hashed values.
 */
const enable2FAController = async (req, res) => {
  try {
    const userId = req.user.id; // Assumes requireJwtAuth middleware has populated req.user.
    const secret = generateTOTPSecret();
    const { plainCodes, hashedCodes } = generateBackupCodes();

    // Update the user with the new TOTP secret and hashed backup codes.
    const user = await User.findByIdAndUpdate(
      userId,
      { totpSecret: secret, backupCodes: hashedCodes },
      { new: true },
    );

    // Prepare the otpauth URL for QR code generation using the safe app title.
    const otpauthUrl = `otpauth://totp/${safeAppTitle}:${user.email}?secret=${secret}&issuer=${safeAppTitle}`;

    res.status(200).json({
      message: '2FA secret generated. Scan the QR code with your authenticator app and verify the token.',
      otpauthUrl,
      backupCodes: plainCodes, // Provide plain backup codes for one-time download.
    });
  } catch (err) {
    logger.error('[enable2FAController]', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Verify the TOTP token provided by the user.
 * This endpoint only verifies the token without updating the user record.
 */
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

/**
 * Confirm 2FA: after a successful verification, mark 2FA as enabled.
 */
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

/**
 * Disable 2FA by clearing the TOTP secret and backup codes.
 */
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

/**
 * Regenerate backup codes.
 * New backup codes are generated and stored as hashed values, while the plain codes are returned once.
 */
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