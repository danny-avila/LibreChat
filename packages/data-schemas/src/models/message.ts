import mongoose from 'mongoose';
import mongoMeili from '~/models/plugins/mongoMeili';
import messageSchema from '~/schema/message';
import type * as t from '~/types';

if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
  messageSchema.plugin(mongoMeili, {
    host: process.env.MEILI_HOST,
    apiKey: process.env.MEILI_MASTER_KEY,
    indexName: 'messages',
    primaryKey: 'messageId',
  });
}

export const Message =
  mongoose.models.Message || mongoose.model<t.IMessage>('Message', messageSchema);
