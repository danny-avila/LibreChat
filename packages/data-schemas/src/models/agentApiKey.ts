import agentApiKeySchema, { IAgentApiKey } from '~/schema/agentApiKey';

export function createAgentApiKeyModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.AgentApiKey || mongoose.model<IAgentApiKey>('AgentApiKey', agentApiKeySchema)
  );
}
