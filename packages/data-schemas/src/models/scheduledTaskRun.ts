import scheduledTaskRunSchema from '~/schema/scheduledTaskRun';
import type { IScheduledTaskRun } from '~/types';

/**
 * Creates or returns the ScheduledTaskRun model using the provided mongoose instance and schema
 */
export function createScheduledTaskRunModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ScheduledTaskRun ||
    mongoose.model<IScheduledTaskRun>('ScheduledTaskRun', scheduledTaskRunSchema)
  );
}
