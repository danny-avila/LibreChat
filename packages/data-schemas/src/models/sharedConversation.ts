import sharedConversationSchema, { ISharedConversation } from '~/schema/sharedConversation';

/**
 * Creates or returns the SharedConversation model using the provided mongoose instance and schema
 */
export function createSharedConversationModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.SharedConversation ||
    mongoose.model<ISharedConversation>('SharedConversation', sharedConversationSchema)
  );
}
