import scheduledTaskSchema from '~/schema/scheduledTask';
import type { IScheduledTask } from '~/types';

/**
 * Creates or returns the ScheduledTask model using the provided mongoose instance and schema
 */
export function createScheduledTaskModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ScheduledTask ||
    mongoose.model<IScheduledTask>('ScheduledTask', scheduledTaskSchema)
  );
}
