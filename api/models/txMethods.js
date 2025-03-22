const { Transaction } = require('./Transaction');
const { logger } = require('~/config');

/**
 * Updates a user's token balance based on a transaction.
 *
 * @async
 * @function
 * @param {Object} params - The function parameters.
 * @param {string} params.user - The user ID.
 * @param {import('@librechat/data-schemas').IBalance} params.record
 * @returns {Promise<void>}
 */
const logRefill = async ({ user, record }) => {
  try {
    await Transaction.createAutoRefillTransaction({
      user,
      tokenType: 'credits',
      context: 'autoRefill',
      rawAmount: record.refillAmount,
    });
    logger.debug('[Balance.check] Transaction recorded for auto-refill', {
      refillAmount: record.refillAmount,
    });
  } catch (error) {
    logger.error('[Balance.check] Failed to record transaction for auto-refill', error);
  }
};

module.exports = {
  logRefill,
};
