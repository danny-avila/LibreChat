import skillSchema from '~/schema/skill';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { ISkillDocument } from '~/types/skill';

export function createSkillModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(skillSchema);
  return mongoose.models.Skill || mongoose.model<ISkillDocument>('Skill', skillSchema);
}
