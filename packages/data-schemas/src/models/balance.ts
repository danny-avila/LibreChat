import balanceSchema from '~/schema/balance';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createBalanceModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(balanceSchema);
  return mongoose.models.Balance || mongoose.model<t.IBalance>('Balance', balanceSchema);
}
