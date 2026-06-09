import tenantSchema from '~/schema/tenant';
import type * as t from '~/types';

export function createTenantModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Tenant || mongoose.model<t.ITenant>('Tenant', tenantSchema);
}
