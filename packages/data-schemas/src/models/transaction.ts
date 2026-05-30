import transactionSchema, { ITransaction } from '~/schema/transaction';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createTransactionModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(transactionSchema);
  return (
    mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', transactionSchema)
  );
}
