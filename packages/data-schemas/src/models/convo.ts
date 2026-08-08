import { Model } from 'mongoose';
import type { SearchSink } from '~/models/plugins/projection';
import type * as t from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import { applySearchSync } from '~/models/plugins/projection';
import createMeiliSink from '~/models/plugins/mongoMeili';
import convoSchema from '~/schema/convo';

export function createConversationModel(
  mongoose: typeof import('mongoose'),
): Model<t.IConversation> {
  applyTenantIsolation(convoSchema);
  const sinks: SearchSink[] = [];
  if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    sinks.push(
      createMeiliSink(convoSchema, {
        mongoose,
        host: process.env.MEILI_HOST,
        apiKey: process.env.MEILI_MASTER_KEY,
        /** Note: Will get created automatically if it doesn't exist already */
        indexName: 'convos',
        primaryKey: 'conversationId',
      }),
    );
  }
  applySearchSync(convoSchema, {
    mongoose,
    kind: 'conversation',
    primaryKey: 'conversationId',
    sinks,
  });
  return (
    mongoose.models.Conversation || mongoose.model<t.IConversation>('Conversation', convoSchema)
  );
}
