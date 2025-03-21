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

  // Retrieve the complete balance record
  let record = await this.findOne({ user }).lean();
  if (!record) {
    logger.debug('[Balance.check] No balance record found for user', { user });
    return {
      canSpend: false,
      balance: 0,
      tokenCost,
    };
  }
  let balance = record.tokenCredits;

  logger.debug('[Balance.check] Initial state', {
    user,
    model,
    endpoint,
    valueKey,
    tokenType,
    amount,
    balance,
    multiplier,
    endpointTokenConfig: !!endpointTokenConfig,
  });

  // Only perform auto-refill if spending would bring the balance to 0 or below
  if (balance - tokenCost <= 0 && record.autoRefillEnabled && record.refillAmount > 0) {
    const lastRefillDate = new Date(record.lastRefill);
    const nextRefillDate = addIntervalToDate(
      lastRefillDate,
      record.refillIntervalValue,
      record.refillIntervalUnit,
    );
    const now = new Date();

    if (now >= nextRefillDate) {
      record = await this.findOneAndUpdate(
        { user },
        {
          $inc: { tokenCredits: record.refillAmount },
          $set: { lastRefill: new Date() },
        },
        { new: true },
      ).lean();
      balance = record.tokenCredits;
      logger.debug('[Balance.check] Auto-refill performed', { balance });
    }
  }

  logger.debug('[Balance.check] Token cost', { tokenCost });

  return { canSpend: balance >= tokenCost, balance, tokenCost };
};

module.exports = mongoose.model('Balance', balanceSchema);
