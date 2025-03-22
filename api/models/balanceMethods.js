const { ViolationTypes } = require('librechat-data-provider');
const { logViolation } = require('~/cache');
const { logger } = require('~/config');
const Balance = require('./Balance');

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
 * Updates a user's token balance based on a transaction.
 *
 * @async
 * @function
 * @param {Object} params - The function parameters.
 * @param {string} params.user - The user ID.
 * @param {number} params.incrementValue - The value to increment the balance by (can be negative).
 * @returns {Promise<Object>} Returns the updated balance response.
 */
const updateBalance = async ({ user, incrementValue }) => {
  // Use findOneAndUpdate with a conditional update to make the balance update atomic
  // This prevents race conditions when multiple transactions are processed concurrently
  const balanceResponse = await Balance.findOneAndUpdate(
    { user },
    [
      {
        $set: {
          tokenCredits: {
            $cond: {
              if: { $lt: [{ $add: ['$tokenCredits', incrementValue] }, 0] },
              then: 0,
              else: { $add: ['$tokenCredits', incrementValue] },
            },
          },
        },
      },
    ],
    { upsert: true, new: true },
  ).lean();

  return balanceResponse;
};

/**
 * Checks the balance for a user and determines if they can spend a certain amount.
 * If the user cannot spend the amount, it logs a violation and denies the request.
 *
 * @async
 * @function
 * @param {Object} params - The function parameters.
 * @param {Express.Request} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {Object} params.txData - The transaction data.
 * @param {string} params.txData.user - The user ID or identifier.
 * @param {('prompt' | 'completion')} params.txData.tokenType - The type of token.
 * @param {number} params.txData.amount - The amount of tokens.
 * @param {string} params.txData.model - The model name or identifier.
 * @param {string} [params.txData.endpointTokenConfig] - The token configuration for the endpoint.
 * @returns {Promise<import('@librechat/data-schemas').IBalance & { refilled: boolean }>} Throws error if the user cannot spend the amount.
 * @throws {Error} Throws an error if there's an issue with the balance check.
 */
const checkBalance = async ({ req, res, txData }) => {
  // Use Balance.check to get basic balance information
  /** @type {{ canSpend: boolean, balance: number, tokenCost: number, record: import('@librechat/data-schemas').IBalance }} */
  const { canSpend, balance, tokenCost, record } = await Balance.check(txData);
  const { user, amount } = txData;

  // Handle auto-refill if needed
  let updatedBalance = balance;
  if (record && !canSpend && record.autoRefillEnabled && record.refillAmount > 0) {
    const lastRefillDate = new Date(record.lastRefill);
    const nextRefillDate = addIntervalToDate(
      lastRefillDate,
      record.refillIntervalValue,
      record.refillIntervalUnit,
    );
    const now = new Date();

    if (now >= nextRefillDate) {
      const updatedRecord = await Balance.findOneAndUpdate(
        { user },
        {
          $inc: { tokenCredits: record.refillAmount },
          $set: { lastRefill: new Date() },
        },
        { new: true },
      ).lean();
      updatedBalance = updatedRecord.tokenCredits;
      logger.debug('[checkBalance] Auto-refill performed', { updatedBalance });
      record.refilled = true;
      // Check if the balance is now sufficient after auto-refill
      if (updatedBalance >= tokenCost) {
        return record;
      }
    }
  }

  // If we can spend or auto-refill made it possible to spend
  if (canSpend) {
    return record;
  }

  // Otherwise, log violation and throw error
  const type = ViolationTypes.TOKEN_BALANCE;
  const errorMessage = {
    type,
    balance: updatedBalance,
    tokenCost,
    promptTokens: amount,
  };

  if (txData.generations && txData.generations.length > 0) {
    errorMessage.generations = txData.generations;
  }

  await logViolation(req, res, type, errorMessage, 0);
  throw new Error(JSON.stringify(errorMessage));
};

module.exports = {
  checkBalance,
  updateBalance,
};
