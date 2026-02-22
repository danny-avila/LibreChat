import promptGroupSchema from '~/schema/promptGroup';
import type { IPromptGroupDocument } from '~/types/prompts';

/**
 * Creates or returns the PromptGroup model using the provided mongoose instance and schema
 */
export function createPromptGroupModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.PromptGroup ||
    mongoose.model<IPromptGroupDocument>('PromptGroup', promptGroupSchema)
  );
}
