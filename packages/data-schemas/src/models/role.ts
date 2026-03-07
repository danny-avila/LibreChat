import roleSchema from '~/schema/role';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IRole } from '~/types';

export function createRoleModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(roleSchema);
  return mongoose.models.Role || mongoose.model<IRole>('Role', roleSchema);
}
