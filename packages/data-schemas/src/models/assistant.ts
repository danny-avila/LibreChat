import type { IAssistant } from '~/types';
import assistantSchema from '~/schema/assistant';

/**
 * Creates or returns the Assistant model using the provided mongoose instance and schema
 */
export function createAssistantModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Assistant || mongoose.model<IAssistant>('Assistant', assistantSchema);
}
