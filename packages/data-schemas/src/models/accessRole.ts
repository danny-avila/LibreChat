import accessRoleSchema from '~/schema/accessRole';
import type * as t from '~/types';

/**
 * Creates or returns the AccessRole model using the provided mongoose instance and schema
 */
export function createAccessRoleModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.AccessRole || mongoose.model<t.IAccessRole>('AccessRole', accessRoleSchema)
  );
}
