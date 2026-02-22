import promptSchema from '~/schema/prompt';
import type { IPrompt } from '~/types/prompts';

/**
 * Creates or returns the Prompt model using the provided mongoose instance and schema
 */
export function createPromptModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Prompt || mongoose.model<IPrompt>('Prompt', promptSchema);
}
