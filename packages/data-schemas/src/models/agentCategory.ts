import agentCategorySchema from '~/schema/agentCategory';
import type * as t from '~/types';

/**
 * Creates or returns the AgentCategory model using the provided mongoose instance and schema
 */
export function createAgentCategoryModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.AgentCategory ||
    mongoose.model<t.IAgentCategory>('AgentCategory', agentCategorySchema)
  );
}
