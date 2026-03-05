const { logger } = require('@librechat/data-schemas');
const { ViolationTypes } = require('librechat-data-provider');
const { createAutoRefillTransaction } = require('./Transaction');
const { logViolation } = require('~/cache');
const { getMultiplier } = require('./tx');
const { Balance } = require('~/db/models');

function isInvalidDate(date) {
  return isNaN(date);
}

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
 *
 * When `specName` is provided the function operates on the per-spec isolated credit
 * bucket (`perModelSpecTokenCredits[specName]`) instead of the global `tokenCredits`.
 * The per-spec bucket is lazily initialised on first use from `specBalance.startBalance`.
 *
 * @param {Object} params
 * @param {string} params.user
 * @param {string} params.model
 * @param {string} params.endpoint
 * @param {string} [params.valueKey]
 * @param {string} params.tokenType
 * @param {number} params.amount
 * @param {Object} [params.endpointTokenConfig]
 * @param {string} [params.specName] - Active modelSpec name.  When set, uses the per-spec bucket.
 * @param {Object} [params.specBalance] - The `balance` block from the active modelSpec.
 */
const checkBalanceRecord = async function ({
  user,
  model,
  endpoint,
  valueKey,
  tokenType,
  amount,
  endpointTokenConfig,
  specName,
  specBalance,
}) {
  const multiplier = getMultiplier({ valueKey, tokenType, model, endpoint, endpointTokenConfig });
  const tokenCost = amount * multiplier;

  let record = await Balance.findOne({ user }).lean();

  if (specName != null) {
    // ── Per-spec isolated bucket path ──────────────────────────────────────

    // Mongoose Map fields are serialised as plain objects by .lean()
    const specsMap = record?.perModelSpecTokenCredits ?? {};
    const hasEntry = Object.prototype.hasOwnProperty.call(specsMap, specName);

    let balance = hasEntry ? (specsMap[specName] ?? 0) : null;

    // Lazy initialisation: create the bucket from the spec's startBalance on first use.
    if (balance === null) {
      const startBalance = specBalance?.startBalance ?? 0;
      balance = startBalance;
      try {
        // Build a clean map (scalar entries only) merged with the new spec entry.
        // Avoids dot-notation splitting and Mongoose Map hydration issues on old docs.
        const currentMap = record?.perModelSpecTokenCredits ?? {};
        const cleanMap = Object.fromEntries(
          Object.entries(currentMap).filter(([, v]) => typeof v === 'number'),
        );
        cleanMap[specName] = startBalance;
        await Balance.findOneAndUpdate(
          { user },
          { $set: { perModelSpecTokenCredits: cleanMap } },
          { upsert: true },
        );
        logger.debug('[Balance.check] Lazily initialised per-spec bucket', {
          user,
          specName,
          startBalance,
        });
      } catch (err) {
        logger.error('[Balance.check] Failed to lazily initialise per-spec bucket', err);
      }
    }

    logger.debug('[Balance.check] Per-spec initial state', {
      user,
      specName,
      model,
      endpoint,
      balance,
      tokenCost,
    });

    // Per-spec auto-refill
    if (
      balance - tokenCost <= 0 &&
      specBalance?.autoRefillEnabled === true &&
      specBalance?.refillAmount > 0 &&
      specBalance?.refillIntervalValue != null &&
      specBalance?.refillIntervalUnit != null
    ) {
      const lastRefillMap = record?.perModelSpecLastRefill ?? {};
      const rawLastRefill = lastRefillMap[specName];
      const lastRefillDate = rawLastRefill != null ? new Date(rawLastRefill) : null;
      const now = new Date();

      if (
        lastRefillDate === null ||
        isInvalidDate(lastRefillDate) ||
        now >=
          addIntervalToDate(
            lastRefillDate,
            specBalance.refillIntervalValue,
            specBalance.refillIntervalUnit,
          )
      ) {
        try {
          const result = await createAutoRefillTransaction({
            user,
            tokenType: 'credits',
            context: 'autoRefill',
            rawAmount: specBalance.refillAmount,
            specName,
          });
          balance = result.balance;
        } catch (error) {
          logger.error('[Balance.check] Failed to record per-spec auto-refill transaction', error);
        }
      }
    }

    logger.debug('[Balance.check] Per-spec token cost', { specName, tokenCost });
    return { canSpend: balance >= tokenCost, balance, tokenCost };
  }

  // ── Global tokenCredits path (unchanged) ────────────────────────────────

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
 * @param {string} [params.txData.specName] - The active modelSpec name (enables per-spec balance).
 * @param {Object} [params.txData.specBalance] - The balance config block of the active modelSpec.
 * @returns {Promise<boolean>} Throws error if the user cannot spend the amount.
 * @throws {Error} Throws an error if there's an issue with the balance check.
 */
const checkBalance = async ({ req, res, txData }) => {
  const { canSpend, balance, tokenCost } = await checkBalanceRecord(txData);
  if (canSpend) {
    return true;
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
