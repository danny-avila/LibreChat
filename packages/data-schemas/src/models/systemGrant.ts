import systemGrantSchema from '~/schema/systemGrant';
import type * as t from '~/types';

/**
 * Creates or returns the SystemGrant model using the provided mongoose instance and schema
 */
export function createSystemGrantModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.SystemGrant || mongoose.model<t.ISystemGrant>('SystemGrant', systemGrantSchema)
  );
}
