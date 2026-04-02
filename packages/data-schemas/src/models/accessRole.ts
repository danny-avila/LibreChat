import accessRoleSchema from '~/schema/accessRole';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createAccessRoleModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(accessRoleSchema);
  return (
    mongoose.models.AccessRole || mongoose.model<t.IAccessRole>('AccessRole', accessRoleSchema)
  );
}
