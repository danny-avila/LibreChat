import aclEntrySchema from '~/schema/aclEntry';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createAclEntryModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(aclEntrySchema);
  return mongoose.models.AclEntry || mongoose.model<t.IAclEntry>('AclEntry', aclEntrySchema);
}
