import agentApiKeySchema, { IAgentApiKey } from '~/schema/agentApiKey';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createAgentApiKeyModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(agentApiKeySchema);
  return (
    mongoose.models.AgentApiKey || mongoose.model<IAgentApiKey>('AgentApiKey', agentApiKeySchema)
  );
}
