import mongoose from 'mongoose';
import type * as t from '~/types';
import mongoMeili from '~/models/plugins/mongoMeili';
import convoSchema from '~/schema/convo';

if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
  convoSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY,
    /** Note: Will get created automatically if it doesn't exist already */
    indexName: 'convos',
    primaryKey: 'conversationId',
  });
}

export const Conversation =
  mongoose.models.Conversation || mongoose.model<t.IConversation>('Conversation', convoSchema);
