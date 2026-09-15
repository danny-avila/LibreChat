import { Model } from 'mongoose';
import conversationTagSchema, { IConversationTag } from '~/schema/conversationTag';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import mongoMeili from '~/models/plugins/mongoMeili';

export function createConversationTagModel(
  mongoose: typeof import('mongoose'),
): Model<IConversationTag> {
  applyTenantIsolation(conversationTagSchema);
  if (process.env.MEILI_HOST && process.env.MEILI_MASTER_KEY) {
    conversationTagSchema.plugin(mongoMeili, {
      mongoose,
      host: process.env.MEILI_HOST,
      apiKey: process.env.MEILI_MASTER_KEY,
      indexName: 'conversation_tags',
      primaryKey: '_id',
      searchableAttributes: ['tag'],
    });
  }
  return (
    mongoose.models.ConversationTag ||
    mongoose.model<IConversationTag>('ConversationTag', conversationTagSchema)
  );
}
