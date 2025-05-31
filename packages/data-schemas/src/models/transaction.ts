import transactionSchema, { ITransaction } from '~/schema/transaction';

/**
 * Creates or returns the Transaction model using the provided mongoose instance and schema
 */
export function createTransactionModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', transactionSchema)
  );
}
