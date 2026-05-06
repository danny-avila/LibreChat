import skillFileSchema from '~/schema/skillFile';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { ISkillFileDocument } from '~/types/skill';

export function createSkillFileModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(skillFileSchema);
  return (
    mongoose.models.SkillFile || mongoose.model<ISkillFileDocument>('SkillFile', skillFileSchema)
  );
}
