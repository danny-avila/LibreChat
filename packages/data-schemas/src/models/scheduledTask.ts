import scheduledTaskSchema from '~/schema/scheduledTask';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IScheduledTask } from '~/types';

export function createScheduledTaskModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(scheduledTaskSchema);
  return (
    mongoose.models.ScheduledTask ||
    mongoose.model<IScheduledTask>('ScheduledTask', scheduledTaskSchema)
  );
}
