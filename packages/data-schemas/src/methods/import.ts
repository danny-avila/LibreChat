import type { FilterQuery, Model } from 'mongoose';
import type { IConversation, IMessage } from '~/types';
import { runAsSystem } from '~/config/tenantContext';

export interface ConversationImportCleanupScope {
  user: string;
  conversationIds: readonly string[];
  tenantId?: string;
}

export interface ConversationImportMethods {
  deleteImportedMessages(scope: ConversationImportCleanupScope): Promise<void>;
  deleteImportedConversations(scope: ConversationImportCleanupScope): Promise<void>;
}

function createImportCleanupFilter<T>(scope: ConversationImportCleanupScope): FilterQuery<T> {
  return {
    user: scope.user,
    conversationId: { $in: scope.conversationIds },
    ...(scope.tenantId == null ? { tenantId: { $exists: false } } : { tenantId: scope.tenantId }),
  };
}

export function createConversationImportMethods(
  mongoose: typeof import('mongoose'),
): ConversationImportMethods {
  async function deleteImportedMessages(scope: ConversationImportCleanupScope): Promise<void> {
    if (scope.conversationIds.length === 0) {
      return;
    }
    const Message = mongoose.models.Message as Model<IMessage>;
    await runAsSystem(async () => {
      await Message.deleteMany(createImportCleanupFilter<IMessage>(scope));
    });
  }

  async function deleteImportedConversations(scope: ConversationImportCleanupScope): Promise<void> {
    if (scope.conversationIds.length === 0) {
      return;
    }
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    await runAsSystem(async () => {
      await Conversation.deleteMany(createImportCleanupFilter<IConversation>(scope));
    });
  }

  return { deleteImportedMessages, deleteImportedConversations };
}
