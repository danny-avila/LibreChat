import agentSchema from '~/schema/agent';
import type { IAgent } from '~/types';

/**
 * Creates or returns the Agent model using the provided mongoose instance and schema
 */
export function createAgentModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Agent || mongoose.model<IAgent>('Agent', agentSchema);
}
