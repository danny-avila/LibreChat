const mongoose = require('mongoose');
const { balanceSchema } = require('@librechat/data-schemas');
const { getMultiplier } = require('./tx');
const { logger } = require('~/config');

/**
 * Adds a time interval to a given date.
 * @param {Date} date - The starting date.
 * @param {number} value - The numeric value of the interval.
 * @param {'seconds'|'minutes'|'hours'|'days'|'weeks'|'months'} unit - The unit of time.
 * @returns {Date} A new Date representing the starting date plus the interval.
 */
const addIntervalToDate = (date, value, unit) => {
  const result = new Date(date);
  switch (unit) {
    case 'seconds':
      result.setSeconds(result.getSeconds() + value);
      break;
    case 'minutes':
      result.setMinutes(result.getMinutes() + value);
      break;
    case 'hours':
      result.setHours(result.getHours() + value);
      break;
    case 'days':
      result.setDate(result.getDate() + value);
      break;
    case 'weeks':
      result.setDate(result.getDate() + value * 7);
      break;
    case 'months':
      result.setMonth(result.getMonth() + value);
      break;
    default:
      break;
  }
  return result;
};

/**
 * Simple check method that calculates token cost and returns balance info.
 * The auto-refill logic has been moved to balanceMethods.js to prevent circular dependencies.
 */
balanceSchema.statics.check = async function ({
  user,
  model,
  endpoint,
  valueKey,
  tokenType,
  amount,
  endpointTokenConfig,
}) {
  const multiplier = getMultiplier({ valueKey, tokenType, model, endpoint, endpointTokenConfig });
  const tokenCost = amount * multiplier;

  // Retrieve the balance record
  const record = await this.findOne({ user }).lean();
  if (!record) {
    logger.debug('[Balance.check] No balance record found for user', { user });
    return {
      canSpend: false,
      balance: 0,
      tokenCost,
    };
  }
  const balance = record.tokenCredits;

  logger.debug('[Balance.check] Balance check', {
    user,
    balance,
    tokenCost,
  });

  return {
    canSpend: balance >= tokenCost,
    balance,
    tokenCost,
    record, // Include the full record for use in balanceMethods
  };
};

module.exports = mongoose.model('Balance', balanceSchema);
