import convoSchema from '~/schema/convo';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type * as t from '~/types';
import mongoMeili from '~/models/plugins/mongoMeili';

export function createConversationModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(convoSchema);
  if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    convoSchema.plugin(mongoMeili, {
      mongoose,
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      /** Note: Will get created automatically if it doesn't exist already */
      indexName: 'convos',
      primaryKey: 'conversationId',
    });
  }
  return (
    mongoose.models.Conversation || mongoose.model<t.IConversation>('Conversation', convoSchema)
  );
}
