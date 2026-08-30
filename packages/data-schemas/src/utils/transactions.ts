import logger from '~/config/winston';

export const CANCEL_RATE = 1.15;

const TRANSACTION_PROBE_COLLECTION = '__transaction_test__';

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
    /** Amazon DocumentDB rejects a transaction that touches a collection which
     * does not exist ("Feature not supported: non-existent collection in
     * transaction"), so probing a missing canary reports engines that fully
     * support transactions as unsupported and silently drops every caller to
     * the non-transactional path. Materialize the canary first; this runs once
     * per process because the result is cached by `getTransactionSupport`. */
    await mongoose.connection.db?.createCollection(TRANSACTION_PROBE_COLLECTION).catch(() => {
      /** already exists, or the user cannot create collections — probe anyway */
    });
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      await mongoose.connection.db
        ?.collection(TRANSACTION_PROBE_COLLECTION)
        .findOne({}, { session });

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
  if (transactionSupportCache !== null) {
    return transactionSupportCache;
  }
  return await supportsTransactions(mongoose);
};
