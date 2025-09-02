const { logger } = require('@librechat/data-schemas');
const { getBalanceConfig } = require('~/server/services/Config');
const { Balance } = require('~/db/models');

/**
 * Middleware to synchronize user balance settings with current balance configuration.
 * @function
 * @param {Object} req - Express request object containing user information.
 * @param {Object} res - Express response object.
 * @param {import('express').NextFunction} next - Next middleware function.
 */
const setBalanceConfig = async (req, res, next) => {
  try {
    const balanceConfig = await getBalanceConfig();
    if (!balanceConfig?.enabled) {
      return next();
    }
    if (balanceConfig.startBalance == null) {
      return next();
    }

    const userId = req.user._id;
    const userBalanceRecord = await Balance.findOne({ user: userId }).lean();
    const updateFields = buildUpdateFields(balanceConfig, userBalanceRecord);

    if (Object.keys(updateFields).length === 0) {
      return next();
    }

    await Balance.findOneAndUpdate(
      { user: userId },
      { $set: updateFields },
      { upsert: true, new: true },
    );

    next();
  } catch (error) {
    logger.error('Error setting user balance:', error);
    next(error);
  }
};

/**
 * Build an object containing fields that need updating
 * @param {Object} config - The balance configuration
 * @param {Object|null} userRecord - The user's current balance record, if any
 * @returns {Object} Fields that need updating
 */
function buildUpdateFields(config, userRecord) {
  const updateFields = {};

  // Ensure user record has the required fields
  if (!userRecord) {
    updateFields.user = userRecord?.user;
    updateFields.tokenCredits = config.startBalance;
  }

  if (userRecord?.tokenCredits == null && config.startBalance != null) {
    updateFields.tokenCredits = config.startBalance;
  }

  const isAutoRefillConfigValid =
    config.autoRefillEnabled &&
    config.refillIntervalValue != null &&
    config.refillIntervalUnit != null &&
    config.refillAmount != null;

  if (!isAutoRefillConfigValid) {
    return updateFields;
  }

  if (userRecord?.autoRefillEnabled !== config.autoRefillEnabled) {
    updateFields.autoRefillEnabled = config.autoRefillEnabled;
  }

  if (userRecord?.refillIntervalValue !== config.refillIntervalValue) {
    updateFields.refillIntervalValue = config.refillIntervalValue;
  }

  if (userRecord?.refillIntervalUnit !== config.refillIntervalUnit) {
    updateFields.refillIntervalUnit = config.refillIntervalUnit;
  }

  if (userRecord?.refillAmount !== config.refillAmount) {
    updateFields.refillAmount = config.refillAmount;
  }

  return updateFields;
}

module.exports = setBalanceConfig;
