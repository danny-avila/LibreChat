const { logger } = require('@librechat/data-schemas');
const { ViolationTypes } = require('librechat-data-provider');
const { createAutoRefillTransaction } = require('./Transaction');
// const { logViolation } = require('~/cache');
const { getMultiplier } = require('./tx');
const { Balance } = require('~/db/models');
const { kebabCase } = require('lodash');

function isInvalidDate(date) {
  return isNaN(date);
}

function findModelSpecByName(appConfig, specName) {
  return (
    appConfig.modelSpecs?.list?.find((spec) => kebabCase(spec.name) === kebabCase(specName)) || null
  );
}

/**
 * Update the balance record for a user, creating a new one if it doesn't exist.
 *
 * @param {Object} params - The function parameters.
 * @param {string} params.spec - The model spec name or identifier.
 * @param {Object} params.user - The user object.
 * @param {number} params.amount - The new balance amount
 * @param {Object} [params.setValues] - Additional fields to set on the balance record.
 * @param {import('@librechat/data-schemas').AppConfig} appConfig - The app configuration.
 * @returns {Promise<Object>} The updated balance record.
 */
async function updateUserBalance({ spec, user, amount, setValues }, appConfig) {
  // If spec is provided, check for per-spec balance first
  if (spec) {
    const modelSpec = findModelSpecByName(appConfig, spec);
    if (modelSpec?.balance?.enabled) {
      return Balance.findOneAndUpdate(
        { user: user._id },
        { $set: { [`perSpecTokenCredits.${dashCa(spec)}`]: amount, ...(setValues || {}) } },
        { upsert: true, new: true },
      ).lean();
    }
  }

  // return general balance update
  return await Balance.findOneAndUpdate(
    { user: user._id },
    { $set: { tokenCredits: amount, ...(setValues || {}) } },
    { upsert: true, new: true },
  ).lean();
}

/**
 * Simple check method that calculates token cost and returns balance info.
 * The auto-refill logic has been moved to balanceMethods.js to prevent circular dependencies.
 */
async function checkBalanceRecord(
  { user, model, spec, endpoint, valueKey, tokenType, amount, endpointTokenConfig },
  appConfig,
) {
  const multiplier = getMultiplier({ valueKey, tokenType, model, endpoint, endpointTokenConfig });
  const tokenCost = amount * multiplier;
  const balance = await getUserBalance({ user, spec }, appConfig);

  // Retrieve the balance record
  if (balance === undefined) {
    logger.debug('[Balance.check] No balance record found for user', { user });
    return {
      canSpend: false,
      balance: 0,
      tokenCost,
    };
  }

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
  // And that the "balance" config is not being used
  if (
    balance.tokenCredits - tokenCost <= 0 &&
    balance.autoRefillEnabled &&
    balance.refillAmount > 0
  ) {
    const lastRefillDate = new Date(balance.lastRefill);
    const now = new Date();
    if (
      isInvalidDate(lastRefillDate) ||
      now >=
        addIntervalToDate(lastRefillDate, balance.refillIntervalValue, balance.refillIntervalUnit)
    ) {
      try {
        /** @type {{ rate: number, user: string, balance: number, transaction: import('@librechat/data-schemas').ITransaction}} */
        const result = await createAutoRefillTransaction({
          user: user,
          spec: balance.spec,
          tokenType: 'credits',
          context: 'autoRefill',
          rawAmount: balance.refillAmount,
        }, appConfig);
        balance = result.balance;
      } catch (error) {
        logger.error('[Balance.check] Failed to record transaction for auto-refill', error);
      }
    }
  }

  logger.debug('[Balance.check] Token cost', { tokenCost });
  return { canSpend: balance.tokenCredits >= tokenCost, balance: balance.tokenCredits, tokenCost };
}

/**
 * Get the balance for a user.
 * If the balance is per-spec, it will return the per-spec balance if it exists and not the auto-refill info.
 * @param {string} params.user - The user ID or identifier.
 * @param {string} [params.spec] - The model spec name or identifier.
 * @param {import('@librechat/data-schemas').AppConfig} appConfig - The app configuration.
 * @returns {Promise<{ spec?: string, tokenCredits: number, autoRefillEnabled?: boolean, refillIntervalValue?: number, refillIntervalUnit?: string, lastRefill?: Date, refillAmount?: number } | undefined>} The user's balance or undefined if no record is found.
 */
async function getUserBalance({ user, spec }, appConfig) {
  const record = await Balance.findOne({ user }).lean();
  if (!record) {
    return;
  }

  // If spec is provided, check for per-spec balance first
  if (spec) {
    const modelSpec = findModelSpecByName(appConfig, spec);
    if (modelSpec?.balance?.enabled) {
      return {
        spec,
        tokenCredits: record.perSpecTokenCredits?.[kebabCase(spec)] || 0,
        autoRefillEnabled: modelSpec.balance.autoRefillEnabled,
        refillIntervalValue: modelSpec.balance.refillIntervalValue,
        refillIntervalUnit: modelSpec.balance.refillIntervalUnit,
        lastRefill: modelSpec.balance.lastRefill,
        refillAmount: modelSpec.balance.refillAmount,
      };
    }
  }

  // Return general balance
  return {
    tokenCredits: record.tokenCredits,
    autoRefillEnabled: record.autoRefillEnabled,
    refillIntervalValue: record.refillIntervalValue,
    refillIntervalUnit: record.refillIntervalUnit,
    lastRefill: record.lastRefill,
    refillAmount: record.refillAmount,
  };
}

/**
 * Adds a time interval to a given date.
 * @param {Date} date - The starting date.
 * @param {number} value - The numeric value of the interval.
 * @param {'seconds'|'minutes'|'hours'|'days'|'weeks'|'months'} unit - The unit of time.
 * @returns {Date} A new Date representing the starting date plus the interval.
 */
function addIntervalToDate(date, value, unit) {
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
}

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
 * @param {string} [params.txData.spec] - The model spec name or identifier.
 * @param {string} [params.txData.endpointTokenConfig] - The token configuration for the endpoint.
 * @param {import('@librechat/data-schemas').AppConfig} appConfig - The app configuration.
 * @returns {Promise<boolean>} Throws error if the user cannot spend the amount.
 * @throws {Error} Throws an error if there's an issue with the balance check.
 */
async function checkBalance({ req, res, txData }, appConfig) {
  const { canSpend, balance, tokenCost } = await checkBalanceRecord(txData, appConfig);
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

  // @TODO     check why logViolation is undefined...
  // await logViolation(req, res, type, errorMessage, 0);
  throw new Error(JSON.stringify(errorMessage));
}

module.exports = {
  checkBalance,
  getUserBalance,
  updateUserBalance,
};
