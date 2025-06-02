import conversationTagSchema, { IConversationTag } from '~/schema/conversationTag';

/**
 * Creates or returns the ConversationTag model using the provided mongoose instance and schema
 */
export function createConversationTagModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.ConversationTag ||
    mongoose.model<IConversationTag>('ConversationTag', conversationTagSchema)
  );
}
