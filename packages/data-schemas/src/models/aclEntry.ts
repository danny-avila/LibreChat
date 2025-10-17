import type * as t from '~/types';
import aclEntrySchema from '~/schema/aclEntry';

/**
 * Creates or returns the AclEntry model using the provided mongoose instance and schema
 */
export function createAclEntryModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.AclEntry || mongoose.model<t.IAclEntry>('AclEntry', aclEntrySchema);
}
