const { logger } = require('@librechat/data-schemas');
const { standardCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const { createAutoRefillTransaction } = require('./Transaction');
const { logViolation } = require('~/cache');
const { getMultiplier, isModelFreeForUser, getFlatCreditCost } = require('./tx');
const { Balance } = require('~/db/models');

const freeTierCache = standardCache('free_tier_hourly', 3600000); // 1 hour TTL

/**
 * Checks and increments the free-tier rate limit for a user.
 * @param {string} userId - The user ID.
 * @param {number} [limit=15] - Max free-tier messages per hour.
 * @returns {Promise<boolean>} True if allowed, false if limit reached.
 */
async function checkFreeTierRateLimit(userId, limit = 15) {
  const key = `free_tier:${userId}`;
  const current = (await freeTierCache.get(key)) || 0;
  if (current >= limit) {
    return false;
  }
  await freeTierCache.set(key, current + 1);
  return true;
}

function isInvalidDate(date) {
  return isNaN(date);
}

/**
 * Simple check method that calculates token cost and returns balance info.
 * The auto-refill logic has been moved to balanceMethods.js to prevent circular dependencies.
 */
const checkBalanceRecord = async function ({
  user,
  model,
  endpoint,
  valueKey,
  tokenType,
  amount,
  endpointTokenConfig,
  isSubscribed,
  freeModelThreshold,
  modelTiers,
  freeTierLimit,
}) {
  logger.debug('[Balance.check] Entry', { model, endpoint, modelTiers: modelTiers ? Object.keys(modelTiers).length + ' tiers' : 'NONE', isSubscribed, freeModelThreshold });

  // Free model for subscriber — always allow, zero cost
  if (isModelFreeForUser({ model, endpoint, freeModelThreshold, isSubscribed, endpointTokenConfig })) {
    return { canSpend: true, balance: 0, tokenCost: 0 };
  }

  // Flat credit cost lookup from modelTiers config
  const flatCost = getFlatCreditCost(model, modelTiers);
  logger.debug('[Balance.check] Flat cost lookup', { model, flatCost });

  // Free tier (cost = 0): rate-limited, always available regardless of balance
  if (flatCost === 0) {
    const allowed = await checkFreeTierRateLimit(user, freeTierLimit);
    if (!allowed) {
      return { canSpend: false, balance: 0, tokenCost: 0, freeTierLimitReached: true };
    }
    return { canSpend: true, balance: 0, tokenCost: 0 };
  }

  // Paid tier with flat cost — check balance against flat cost
  const tokenCost = flatCost !== null && flatCost > 0
    ? flatCost
    : amount * getMultiplier({ valueKey, tokenType, model, endpoint, endpointTokenConfig });

  // Retrieve the balance record
  let record = await Balance.findOne({ user }).lean();
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
    tokenCost,
    flatCost,
    balance,
  });

  // Only perform auto-refill if spending would bring the balance to 0 or below
  if (balance - tokenCost <= 0 && record.autoRefillEnabled && record.refillAmount > 0) {
    const lastRefillDate = new Date(record.lastRefill);
    const now = new Date();
    if (
      isInvalidDate(lastRefillDate) ||
      now >=
        addIntervalToDate(lastRefillDate, record.refillIntervalValue, record.refillIntervalUnit)
    ) {
      try {
        /** @type {{ rate: number, user: string, balance: number, transaction: import('@librechat/data-schemas').ITransaction}} */
        const result = await createAutoRefillTransaction({
          user: user,
          tokenType: 'credits',
          context: 'autoRefill',
          rawAmount: record.refillAmount,
        });
        balance = result.balance;
      } catch (error) {
        logger.error('[Balance.check] Failed to record transaction for auto-refill', error);
      }
    }
  }

  logger.debug('[Balance.check] Token cost', { tokenCost });
  return { canSpend: balance >= tokenCost, balance, tokenCost };
};

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
 * Checks the balance for a user and determines if they can spend a certain amount.
 * If the user cannot spend the amount, it logs a violation and denies the request.
 *
 * @async
 * @function
 * @param {Object} params - The function parameters.
 * @param {ServerRequest} params.req - The Express request object.
 * @param {Express.Response} params.res - The Express response object.
 * @param {Object} params.txData - The transaction data.
 * @param {string} params.txData.user - The user ID or identifier.
 * @param {('prompt' | 'completion')} params.txData.tokenType - The type of token.
 * @param {number} params.txData.amount - The amount of tokens.
 * @param {string} params.txData.model - The model name or identifier.
 * @param {string} [params.txData.endpointTokenConfig] - The token configuration for the endpoint.
 * @returns {Promise<boolean>} Throws error if the user cannot spend the amount.
 * @throws {Error} Throws an error if there's an issue with the balance check.
 */
const checkBalance = async ({ req, res, txData }) => {
  const { canSpend, balance, tokenCost, freeTierLimitReached } = await checkBalanceRecord(txData);
  if (canSpend) {
    return true;
  }

  // Free-tier rate limit reached — different error type
  if (freeTierLimitReached) {
    const type = 'free_tier_limit';
    const errorMessage = {
      type,
      limit: txData.freeTierLimit || 15,
    };
    await logViolation(req, res, type, errorMessage, 0);
    throw new Error(JSON.stringify(errorMessage));
  }

  const type = ViolationTypes.TOKEN_BALANCE;
  const errorMessage = {
    type,
    balance,
    tokenCost,
    promptTokens: txData.amount,
  };

  if (txData.generations && txData.generations.length > 0) {
    errorMessage.generations = txData.generations;
  }

  await logViolation(req, res, type, errorMessage, 0);
  throw new Error(JSON.stringify(errorMessage));
};

module.exports = {
  checkBalance,
};
