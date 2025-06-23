import groupSchema from '~/schema/group';
import type * as t from '~/types';

/**
 * Creates or returns the Group model using the provided mongoose instance and schema
 */
export function createGroupModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Group || mongoose.model<t.IGroup>('Group', groupSchema);
}
