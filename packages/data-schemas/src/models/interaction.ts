import type { IInteraction } from '~/types';
import interactionSchema from '~/schema/interaction';

export function createInteractionModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.Interaction ||
    mongoose.model<IInteraction>('Interaction', interactionSchema)
  );
}