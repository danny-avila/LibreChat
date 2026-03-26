import conversationTagSchema, { IConversationTag } from '~/schema/conversationTag';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';

export function createConversationTagModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(conversationTagSchema);
  return (
    mongoose.models.ConversationTag ||
    mongoose.model<IConversationTag>('ConversationTag', conversationTagSchema)
  );
}
