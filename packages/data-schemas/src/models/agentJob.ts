import agentJobSchema from '~/schema/agentJob';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IAgentJobDocument } from '~/types/agentJob';

export function createAgentJobModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(agentJobSchema);
  return mongoose.models.AgentJob || mongoose.model<IAgentJobDocument>('AgentJob', agentJobSchema);
}
