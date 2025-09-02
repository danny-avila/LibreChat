import sessionSchema from '~/schema/session';
import type * as t from '~/types';

/**
 * Creates or returns the Session model using the provided mongoose instance and schema
 */
export function createSessionModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Session || mongoose.model<t.ISession>('Session', sessionSchema);
}
