import keySchema, { IKey } from '~/schema/key';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createKeyModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(keySchema);
  return mongoose.models.Key || mongoose.model<IKey>('Key', keySchema);
}
