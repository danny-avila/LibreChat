import type * as t from '~/types';
import convoSchema from '~/schema/convo';

/**
 * Creates or returns the Conversation model using the provided mongoose instance and schema
 */
export function createConversationModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.Conversation || mongoose.model<t.IConversation>('Conversation', convoSchema)
  );
}
