import { Model } from 'mongoose';
import type { SearchSink } from '~/models/plugins/projection';
import type * as t from '~/types';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import { applySearchSync } from '~/models/plugins/projection';
import createMeiliSink from '~/models/plugins/mongoMeili';
import messageSchema from '~/schema/message';

export function createMessageModel(mongoose: typeof import('mongoose')): Model<t.IMessage> {
  applyTenantIsolation(messageSchema);
  const sinks: SearchSink[] = [];
  if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    sinks.push(
      createMeiliSink(messageSchema, {
        mongoose,
        host: process.env.MEILI_HOST,
        apiKey: process.env.MEILI_MASTER_KEY,
        indexName: 'messages',
        primaryKey: 'messageId',
      }),
    );
  }
  applySearchSync(messageSchema, {
    mongoose,
    kind: 'message',
    primaryKey: 'messageId',
    sinks,
  });

  return mongoose.models.Message || mongoose.model<t.IMessage>('Message', messageSchema);
}
