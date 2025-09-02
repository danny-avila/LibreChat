import assistantSchema from '~/schema/assistant';
import type { IAssistant } from '~/types';

/**
 * Creates or returns the Assistant model using the provided mongoose instance and schema
 */
export function createAssistantModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Assistant || mongoose.model<IAssistant>('Assistant', assistantSchema);
}
