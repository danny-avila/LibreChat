import systemGrantSchema from '~/schema/systemGrant';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createSystemGrantModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(systemGrantSchema);
  return (
    mongoose.models.SystemGrant || mongoose.model<t.ISystemGrant>('SystemGrant', systemGrantSchema)
  );
}
