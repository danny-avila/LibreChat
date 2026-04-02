import assistantSchema from '~/schema/assistant';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IAssistant } from '~/types';

export function createAssistantModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(assistantSchema);
  return mongoose.models.Assistant || mongoose.model<IAssistant>('Assistant', assistantSchema);
}
