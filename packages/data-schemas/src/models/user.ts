import type * as t from '~/types';
import userSchema from '~/schema/user';

/**
 * Creates or returns the User model using the provided mongoose instance and schema
 */
export function createUserModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.User || mongoose.model<t.IUser>('User', userSchema);
}
