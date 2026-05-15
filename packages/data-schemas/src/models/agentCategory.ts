import agentCategorySchema from '~/schema/agentCategory';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';

export function createAgentCategoryModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(agentCategorySchema);
  return (
    mongoose.models.AgentCategory ||
    mongoose.model<t.IAgentCategory>('AgentCategory', agentCategorySchema)
  );
}
