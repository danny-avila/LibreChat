import type * as t from '~/types';
import balanceSchema from '~/schema/balance';

/**
 * Creates or returns the Balance model using the provided mongoose instance and schema
 */
export function createBalanceModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Balance || mongoose.model<t.IBalance>('Balance', balanceSchema);
}
