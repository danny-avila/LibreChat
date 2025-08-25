import { userActivityLogSchema } from '~/schema/userActivity';
import type { IUserActivityLog } from '~/types';

/**
 * Creates or returns the UserActivityLog model using the provided mongoose instance and schema
 */
export function createUserActivityLogModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.UserActivityLog ||
    mongoose.model<IUserActivityLog>('UserActivityLog', userActivityLogSchema)
  );
}
