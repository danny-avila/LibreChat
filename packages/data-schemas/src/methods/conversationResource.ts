import type { FilterQuery, Model, Types } from 'mongoose';
import type { IConversation, IMessage } from '~/types';
import { activeExpirationFilter, buildRetentionVisibilityFilter } from '~/utils/retention';
import { buildIndexWithRetry } from '~/utils/retry';

export type ConversationResource = Pick<
  IConversation,
  | 'conversationId'
  | 'title'
  | 'createdAt'
  | 'updatedAt'
  | 'agent_id'
  | 'tags'
  | 'isArchived'
  | 'endpoint'
  | 'model'
> & { _id: Types.ObjectId };

export type ConversationMessageResource = Pick<
  IMessage,
  | 'messageId'
  | 'conversationId'
  | 'parentMessageId'
  | 'text'
  | 'content'
  | 'files'
  | 'attachments'
  | 'quotes'
  | 'manualSkills'
  | 'alwaysAppliedSkills'
  | 'sender'
  | 'isCreatedByUser'
  | 'createdAt'
  | 'updatedAt'
  | 'unfinished'
  | 'error'
  | 'finish_reason'
  | 'endpoint'
  | 'model'
  | 'iconURL'
  | 'tokenCount'
  | 'addedConvo'
  | 'feedback'
  | 'metadata'
> & { _id: Types.ObjectId };

export type ConversationPageBoundary = { date: string; id: string };
export type ConversationResourcePage = {
  limit: number;
  boundary?: ConversationPageBoundary;
  agent_id?: string;
  tags?: string[];
  isArchived?: boolean;
};

const conversationFields =
  'conversationId title createdAt updatedAt agent_id tags isArchived endpoint model';
const messageFields =
  'messageId conversationId parentMessageId text content files attachments quotes manualSkills alwaysAppliedSkills sender isCreatedByUser createdAt updatedAt unfinished error finish_reason endpoint model iconURL tokenCount addedConvo feedback metadata.usage metadata.contextUsage metadata.summaryUsedTokens';

function tenantBoundary<T>(tenantId?: string): FilterQuery<T> {
  return (tenantId == null ? { tenantId: { $exists: false } } : { tenantId }) as FilterQuery<T>;
}

export function createConversationResourceMethods(mongoose: typeof import('mongoose')) {
  let listIndexPromise: Promise<string> | undefined;
  function ensureListIndex(): Promise<string> {
    listIndexPromise ??= buildIndexWithRetry(
      () =>
        // eslint-disable-next-line no-restricted-syntax -- Index DDL is collection-wide; it does not read or mutate tenant records.
        mongoose.models.Conversation.collection.createIndex({
          tenantId: 1,
          user: 1,
          updatedAt: -1,
          _id: -1,
        }),
      'createIndex(Conversation.resourceList)',
    ).catch((error) => {
      listIndexPromise = undefined;
      throw error;
    });
    return listIndexPromise;
  }

  const visible = (user: string, tenantId?: string): FilterQuery<IConversation> => ({
    user,
    ...tenantBoundary<IConversation>(tenantId),
    subagentThread: { $exists: false },
    ...buildRetentionVisibilityFilter<IConversation>(),
  });

  return {
    async getConversationResourceDeletionState(
      user: string,
      tenantId: string | undefined,
      conversationId: string,
    ): Promise<'present' | 'recoverable' | 'missing'> {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const Message = mongoose.models.Message as Model<IMessage>;
      const ToolCall = mongoose.models.ToolCall as Model<{
        user: Types.ObjectId;
        conversationId: string;
        tenantId?: string;
      }>;
      const SharedLink = mongoose.models.SharedLink as Model<{
        user?: string;
        conversationId: string;
        tenantId?: string;
      }>;
      const scope = { user, conversationId, ...tenantBoundary<IConversation>(tenantId) };
      const [root, descendant, message, toolCall, sharedLink] = await Promise.all([
        Conversation.exists(scope),
        Conversation.exists({
          user,
          ...tenantBoundary<IConversation>(tenantId),
          'subagentThread.rootConversationId': conversationId,
        }),
        Message.exists({
          user,
          conversationId,
          ...tenantBoundary<IMessage>(tenantId),
        }),
        ToolCall.exists({ user, conversationId, ...tenantBoundary(tenantId) }),
        SharedLink.exists({ user, conversationId, ...tenantBoundary(tenantId) }),
      ]);
      if (root != null) return 'present';
      return descendant != null || message != null || toolCall != null || sharedLink != null
        ? 'recoverable'
        : 'missing';
    },

    async getConversationProviderThreadIds(
      user: string,
      tenantId: string | undefined,
      conversationId: string,
    ): Promise<string[]> {
      const Message = mongoose.models.Message as Model<IMessage>;
      return Message.distinct('thread_id', {
        user,
        conversationId,
        ...tenantBoundary<IMessage>(tenantId),
        thread_id: { $type: 'string', $ne: '' },
        isUserSubmitted: { $ne: true },
      });
    },

    async getConversationResource(
      user: string,
      tenantId: string | undefined,
      conversationId: string,
    ): Promise<ConversationResource | null> {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return Conversation.findOne({ ...visible(user, tenantId), conversationId })
        .select(conversationFields)
        .lean<ConversationResource>();
    },

    async listConversationResources(
      user: string,
      tenantId: string | undefined,
      options: ConversationResourcePage,
    ): Promise<ConversationResource[]> {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const filters: FilterQuery<IConversation>[] = [visible(user, tenantId)];
      if (options.isArchived != null) {
        filters.push(options.isArchived ? { isArchived: true } : { isArchived: { $ne: true } });
      }
      if (options.agent_id) {
        filters.push({ agent_id: options.agent_id });
      }
      if (options.tags?.length) {
        filters.push({ tags: { $in: options.tags } });
      }
      if (options.boundary) {
        const date = new Date(options.boundary.date);
        filters.push({
          $or: [
            { updatedAt: { $lt: date } },
            {
              updatedAt: date,
              _id: { $lt: new mongoose.Types.ObjectId(options.boundary.id) },
            },
          ],
        });
      }

      await ensureListIndex();
      return Conversation.find({ $and: filters })
        .select(conversationFields)
        .sort({ updatedAt: -1, _id: -1 })
        .limit(Math.min(100, Math.max(1, options.limit)) + 1)
        .lean<ConversationResource[]>();
    },

    async listConversationMessageResources(
      user: string,
      tenantId: string | undefined,
      conversationId: string,
      options: Pick<ConversationResourcePage, 'limit' | 'boundary'>,
    ): Promise<ConversationMessageResource[] | null> {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const Message = mongoose.models.Message as Model<IMessage>;
      const filters: FilterQuery<IMessage>[] = [
        { user, conversationId, ...tenantBoundary<IMessage>(tenantId) },
        activeExpirationFilter<IMessage>(),
      ];
      if (options.boundary) {
        const date = new Date(options.boundary.date);
        filters.push({
          $or: [
            { createdAt: { $gt: date } },
            {
              createdAt: date,
              _id: { $gt: new mongoose.Types.ObjectId(options.boundary.id) },
            },
          ],
        });
      }

      const [conversation, messages] = await Promise.all([
        Conversation.exists({ ...visible(user, tenantId), conversationId }),
        Message.find({ $and: filters })
          .select(messageFields)
          .sort({ createdAt: 1, _id: 1 })
          .limit(Math.min(100, Math.max(1, options.limit)) + 1)
          .lean<ConversationMessageResource[]>(),
      ]);
      return conversation == null ? null : messages;
    },
  };
}

export type ConversationResourceMethods = ReturnType<typeof createConversationResourceMethods>;
