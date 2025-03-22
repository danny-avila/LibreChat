const { ViolationTypes } = require('librechat-data-provider');
const { logViolation } = require('~/cache');
const Balance = require('./Balance');

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
 * @returns {Promise<boolean>} Returns true if the user can spend the amount, otherwise denies the request.
 * @throws {Error} Throws an error if there's an issue with the balance check.
 */
const checkBalance = async ({ req, res, txData }) => {
  const { canSpend, balance, tokenCost } = await Balance.check(txData);

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
  updateBalance,
};
