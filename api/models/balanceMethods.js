require('ts-node/register');
const { logger } = require('@librechat/data-schemas');
const { ViolationTypes } = require('librechat-data-provider');
const { createAutoRefillTransaction } = require('./Transaction');
const { logViolation } = require('~/cache');
const { getMultiplier } = require('./tx');
const { Balance, User } = require('~/db/models');
const {
  fetchTokenBalanceAutumn,
  hasSubscriptionAutumn,
  createCheckoutAutumn,
} = require('~/server/services/AutumnService.ts');

function isInvalidDate(date) {
  return isNaN(date);
}

async function resolveAutumnUser(req, userId) {
  const resolved = {
    openidId: req?.user?.openidId ?? req?.user?.openidID ?? undefined,
    email: req?.user?.email ?? undefined,
  };

  if ((resolved.openidId == null || resolved.email == null) && userId) {
    try {
      const userDoc = await User.findById(userId).select('openidId email').lean();
      if (userDoc) {
        if (!resolved.openidId && userDoc.openidId) {
          resolved.openidId = userDoc.openidId;
        }
        if (!resolved.email && userDoc.email) {
          resolved.email = userDoc.email;
        }
      }
    } catch (error) {
      logger.error('[Balance.check] Failed to resolve Autumn identifiers', {
        error,
        userId,
      });
    }
  }

  return {
    openidId: resolved.openidId,
    email: resolved.email,
  };
}

async function synchronizeAutumnBalance(userId, openidId) {
  if (!userId || !openidId) {
    return;
  }

  try {
    const remoteBalance = await fetchTokenBalanceAutumn(openidId);
    if (typeof remoteBalance !== 'number' || Number.isNaN(remoteBalance)) {
      return;
    }

    await Balance.findOneAndUpdate(
      { user: userId },
      { $set: { tokenCredits: remoteBalance } },
      {
        upsert: true,
        setDefaultsOnInsert: true,
        new: false,
      },
    );
  } catch (error) {
    logger.error('[Balance.check] Failed to synchronize balance with Autumn', {
      error,
      userId,
    });
  }
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
}) {
  const multiplier = getMultiplier({ valueKey, tokenType, model, endpoint, endpointTokenConfig });
  const tokenCost = amount * multiplier;

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
  const { openidId, email } = await resolveAutumnUser(req, txData?.user);

  await synchronizeAutumnBalance(txData?.user, openidId);

  const { canSpend, balance, tokenCost } = await checkBalanceRecord(txData);
  if (canSpend) {
    return true;
  }

  let type = ViolationTypes.TOKEN_BALANCE_NO_SUB;
  let checkoutUrl;

  if (openidId) {
    try {
      const subscribed = await hasSubscriptionAutumn(openidId);
      type = subscribed ? ViolationTypes.TOKEN_BALANCE_SUB : ViolationTypes.TOKEN_BALANCE_NO_SUB;

      if (!subscribed) {
        if (!email) {
          logger.warn('[Balance.check] Missing email; unable to create Autumn checkout session', {
            userId: txData?.user,
          });
        } else {
          checkoutUrl = await createCheckoutAutumn({
            openidID: openidId,
            email,
            fingerprint: email,
          });
        }
      }
    } catch (error) {
      logger.error('[Balance.check] Failed to determine Autumn subscription status', {
        error,
        userId: txData?.user,
      });
    }
  } else {
    logger.warn('[Balance.check] Missing OpenID identifier; skipping Autumn subscription check', {
      userId: txData?.user,
    });
  }

  const errorMessage = {
    type,
    balance,
    tokenCost,
    promptTokens: txData.amount,
  };

  if (checkoutUrl && type === ViolationTypes.TOKEN_BALANCE_NO_SUB) {
    errorMessage.checkoutUrl = checkoutUrl;
  }

  if (txData.generations && txData.generations.length > 0) {
    errorMessage.generations = txData.generations;
  }

  await logViolation(req, res, type, errorMessage, 0);
  throw new Error(JSON.stringify(errorMessage));
};

module.exports = {
  checkBalance,
};
