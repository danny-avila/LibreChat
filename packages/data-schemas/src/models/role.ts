import roleSchema from '~/schema/role';
import type { IRole } from '~/types';

/**
 * Creates or returns the Role model using the provided mongoose instance and schema
 */
export function createRoleModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Role || mongoose.model<IRole>('Role', roleSchema);
}
