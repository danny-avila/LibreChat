import type * as t from '~/types';
import mongoMeili from '~/models/plugins/mongoMeili';
import messageSchema from '~/schema/message';

/**
 * Creates or returns the Message model using the provided mongoose instance and schema
 */
export function createMessageModel(mongoose: typeof import('mongoose')) {
  if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    messageSchema.plugin(mongoMeili, {
      mongoose,
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      indexName: 'messages',
      primaryKey: 'messageId',
    });
  }

  return mongoose.models.Message || mongoose.model<t.IMessage>('Message', messageSchema);
}
