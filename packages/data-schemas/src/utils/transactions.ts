import logger from '~/config/winston';

/**
 * Checks if the connected MongoDB deployment supports transactions
 * This requires a MongoDB replica set configuration
 *
 * @returns True if transactions are supported, false otherwise
 */
export const supportsTransactions = async (
  mongoose: typeof import('mongoose'),
): Promise<boolean> => {
  try {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      await mongoose.connection.db?.collection('__transaction_test__').findOne({}, { session });

      await session.commitTransaction();
      logger.debug('MongoDB transactions are supported');
      return true;
    } catch (transactionError: unknown) {
      try {
        await session.abortTransaction();
      } catch (transactionError) {
        /** best-effort abort */
        logger.error(`[supportsTransactions] Error aborting transaction:`, transactionError);
      }
      logger.debug(
        'MongoDB transactions not supported (transaction error):',
        (transactionError as Error)?.message || 'Unknown error',
      );
      return false;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    logger.debug(
      'MongoDB transactions not supported (session error):',
      (error as Error)?.message || 'Unknown error',
    );
    return false;
  }
};

/**
 * Gets whether the current MongoDB deployment supports transactions
 * Caches the result for performance
 *
 * @returns True if transactions are supported, false otherwise
 */
export const getTransactionSupport = async (
  mongoose: typeof import('mongoose'),
  transactionSupportCache: boolean | null,
): Promise<boolean> => {
  let transactionsSupported = false;
  if (transactionSupportCache === null) {
    transactionsSupported = await supportsTransactions(mongoose);
  }
  return transactionsSupported;
};
