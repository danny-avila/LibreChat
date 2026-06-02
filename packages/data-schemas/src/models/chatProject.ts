import chatProjectSchema from '~/schema/chatProject';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import type { IChatProjectDocument } from '~/types';

export function createChatProjectModel(mongoose: typeof import('mongoose')) {
  applyTenantIsolation(chatProjectSchema);
  return (
    mongoose.models.ChatProject ||
    mongoose.model<IChatProjectDocument>('ChatProject', chatProjectSchema, 'chatprojects')
  );
}
