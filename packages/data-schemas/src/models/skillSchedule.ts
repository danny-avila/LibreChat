import skillScheduleSchema from '~/schema/skillSchedule';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { ISkillScheduleDocument } from '~/types/skillSchedule';

export function createSkillScheduleModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(skillScheduleSchema);
  return (
    mongoose.models.SkillSchedule ||
    mongoose.model<ISkillScheduleDocument>('SkillSchedule', skillScheduleSchema)
  );
}
