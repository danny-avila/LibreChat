const mongoose = require('mongoose');
const { logger } = require('~/config');

/**
 * Checks if the connected MongoDB deployment supports transactions
 * This requires a MongoDB replica set configuration
 *
 * @returns {Promise<boolean>} True if transactions are supported, false otherwise
 */
const supportsTransactions = async () => {
  try {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      await mongoose.connection.db.collection('__transaction_test__').findOne({}, { session });

      await session.abortTransaction();
      logger.debug('MongoDB transactions are supported');
      return true;
    } catch (transactionError) {
      logger.debug(
        'MongoDB transactions not supported (transaction error):',
        transactionError.message,
      );
      return false;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    logger.debug('MongoDB transactions not supported (session error):', error.message);
    return false;
  }
};

let transactionSupportCache = null;

/**
 * Gets whether the current MongoDB deployment supports transactions
 * Caches the result for performance
 *
 * @returns {Promise<boolean>} True if transactions are supported, false otherwise
 */
const getTransactionSupport = async () => {
  if (transactionSupportCache === null) {
    transactionSupportCache = await supportsTransactions();
  }
  return transactionSupportCache;
};

/**
 * Resets the transaction support cache
 * Useful for testing or when MongoDB connection changes
 */
const resetTransactionSupportCache = () => {
  transactionSupportCache = null;
};

resetTransactionSupportCache();

module.exports = {
  supportsTransactions,
  getTransactionSupport,
  resetTransactionSupportCache,
};
