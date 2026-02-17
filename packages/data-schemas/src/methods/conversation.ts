import type { FilterQuery, Model, SortOrder } from 'mongoose';
import logger from '~/config/winston';
import { createTempChatExpirationDate } from '~/utils/tempChatRetention';
import type { AppConfig, IConversation } from '~/types';
import type { MessageMethods } from './message';
import type { DeleteResult } from 'mongoose';

export interface ConversationMethods {
  getConvoFiles(conversationId: string): Promise<string[]>;
  searchConversation(conversationId: string): Promise<IConversation | null>;
  deleteNullOrEmptyConversations(): Promise<{
    conversations: { deletedCount?: number };
    messages: { deletedCount?: number };
  }>;
  saveConvo(
    ctx: { userId: string; isTemporary?: boolean; interfaceConfig?: AppConfig['interfaceConfig'] },
    data: { conversationId: string; newConversationId?: string; [key: string]: unknown },
    metadata?: { context?: string; unsetFields?: Record<string, number>; noUpsert?: boolean },
  ): Promise<IConversation | { message: string } | null>;
  bulkSaveConvos(conversations: Array<Record<string, unknown>>): Promise<unknown>;
  getConvosByCursor(
    user: string,
    options?: {
      cursor?: string | null;
      limit?: number;
      isArchived?: boolean;
      tags?: string[];
      search?: string;
      sortBy?: string;
      sortDirection?: string;
    },
  ): Promise<{ conversations: IConversation[]; nextCursor: string | null }>;
  getConvosQueried(
    user: string,
    convoIds: Array<{ conversationId: string }> | null,
    cursor?: string | null,
    limit?: number,
  ): Promise<{
    conversations: IConversation[];
    nextCursor: string | null;
    convoMap: Record<string, unknown>;
  }>;
  getConvo(user: string, conversationId: string): Promise<IConversation | null>;
  getConvoTitle(user: string, conversationId: string): Promise<string | null>;
  deleteConvos(
    user: string,
    filter: FilterQuery<IConversation>,
  ): Promise<DeleteResult & { messages: DeleteResult }>;
}

export function createConversationMethods(
  mongoose: typeof import('mongoose'),
  messageMethods?: Pick<MessageMethods, 'getMessages' | 'deleteMessages'>,
): ConversationMethods {
  function getMessageMethods() {
    if (!messageMethods) {
      throw new Error('Message methods not injected into conversation methods');
    }
    return messageMethods;
  }

  /**
   * Searches for a conversation by conversationId and returns a lean document with only conversationId and user.
   */
  async function searchConversation(conversationId: string) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return await Conversation.findOne({ conversationId }, 'conversationId user').lean();
    } catch (error) {
      logger.error('[searchConversation] Error searching conversation', error);
      throw new Error('Error searching conversation');
    }
  }

  /**
   * Retrieves a single conversation for a given user and conversation ID.
   */
  async function getConvo(user: string, conversationId: string) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return await Conversation.findOne({ user, conversationId }).lean();
    } catch (error) {
      logger.error('[getConvo] Error getting single conversation', error);
      throw new Error('Error getting single conversation');
    }
  }

  /**
   * Deletes conversations and messages with null or empty IDs.
   */
  async function deleteNullOrEmptyConversations() {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const { deleteMessages } = getMessageMethods();
      const filter = {
        $or: [
          { conversationId: null },
          { conversationId: '' },
          { conversationId: { $exists: false } },
        ],
      };

      const result = await Conversation.deleteMany(filter);
      const messageDeleteResult = await deleteMessages(filter);

      logger.info(
        `[deleteNullOrEmptyConversations] Deleted ${result.deletedCount} conversations and ${messageDeleteResult.deletedCount} messages`,
      );

      return {
        conversations: result,
        messages: messageDeleteResult,
      };
    } catch (error) {
      logger.error('[deleteNullOrEmptyConversations] Error deleting conversations', error);
      throw new Error('Error deleting conversations with null or empty conversationId');
    }
  }

  /**
   * Searches for a conversation by conversationId and returns associated file ids.
   */
  async function getConvoFiles(conversationId: string): Promise<string[]> {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return (
        ((await Conversation.findOne({ conversationId }, 'files').lean()) as IConversation | null)
          ?.files ?? []
      );
    } catch (error) {
      logger.error('[getConvoFiles] Error getting conversation files', error);
      throw new Error('Error getting conversation files');
    }
  }

  /**
   * Saves a conversation to the database.
   */
  async function saveConvo(
    {
      userId,
      isTemporary,
      interfaceConfig,
    }: {
      userId: string;
      isTemporary?: boolean;
      interfaceConfig?: AppConfig['interfaceConfig'];
    },
    {
      conversationId,
      newConversationId,
      ...convo
    }: {
      conversationId: string;
      newConversationId?: string;
      [key: string]: unknown;
    },
    metadata?: { context?: string; unsetFields?: Record<string, number>; noUpsert?: boolean },
  ) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const { getMessages } = getMessageMethods();

      if (metadata?.context) {
        logger.debug(`[saveConvo] ${metadata.context}`);
      }

      const messages = await getMessages({ conversationId }, '_id');
      const update: Record<string, unknown> = { ...convo, messages, user: userId };

      if (newConversationId) {
        update.conversationId = newConversationId;
      }

      if (isTemporary) {
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveConvo\` context: ${metadata?.context}`);
          update.expiredAt = null;
        }
      } else {
        update.expiredAt = null;
      }

      const updateOperation: Record<string, unknown> = { $set: update };
      if (metadata?.unsetFields && Object.keys(metadata.unsetFields).length > 0) {
        updateOperation.$unset = metadata.unsetFields;
      }

      const conversation = await Conversation.findOneAndUpdate(
        { conversationId, user: userId },
        updateOperation,
        {
          new: true,
          upsert: metadata?.noUpsert !== true,
        },
      );

      if (!conversation) {
        logger.debug('[saveConvo] Conversation not found, skipping update');
        return null;
      }

      return conversation.toObject();
    } catch (error) {
      logger.error('[saveConvo] Error saving conversation', error);
      if (metadata?.context) {
        logger.info(`[saveConvo] ${metadata.context}`);
      }
      return { message: 'Error saving conversation' };
    }
  }

  /**
   * Saves multiple conversations in bulk.
   */
  async function bulkSaveConvos(conversations: Array<Record<string, unknown>>) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const bulkOps = conversations.map((convo) => ({
        updateOne: {
          filter: { conversationId: convo.conversationId, user: convo.user },
          update: convo,
          upsert: true,
          timestamps: false,
        },
      }));

      const result = await Conversation.bulkWrite(bulkOps);
      return result;
    } catch (error) {
      logger.error('[bulkSaveConvos] Error saving conversations in bulk', error);
      throw new Error('Failed to save conversations in bulk.');
    }
  }

  /**
   * Retrieves conversations using cursor-based pagination.
   */
  async function getConvosByCursor(
    user: string,
    {
      cursor,
      limit = 25,
      isArchived = false,
      tags,
      search,
      sortBy = 'updatedAt',
      sortDirection = 'desc',
    }: {
      cursor?: string | null;
      limit?: number;
      isArchived?: boolean;
      tags?: string[];
      search?: string;
      sortBy?: string;
      sortDirection?: string;
    } = {},
  ) {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const filters: FilterQuery<IConversation>[] = [{ user } as FilterQuery<IConversation>];
    if (isArchived) {
      filters.push({ isArchived: true } as FilterQuery<IConversation>);
    } else {
      filters.push({
        $or: [{ isArchived: false }, { isArchived: { $exists: false } }],
      } as FilterQuery<IConversation>);
    }

    if (Array.isArray(tags) && tags.length > 0) {
      filters.push({ tags: { $in: tags } } as FilterQuery<IConversation>);
    }

    filters.push({
      $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }],
    } as FilterQuery<IConversation>);

    if (search) {
      try {
        const meiliResults = await (
          Conversation as unknown as {
            meiliSearch: (
              query: string,
              options: Record<string, string>,
            ) => Promise<{
              hits: Array<{ conversationId: string }>;
            }>;
          }
        ).meiliSearch(search, { filter: `user = "${user}"` });
        const matchingIds = Array.isArray(meiliResults.hits)
          ? meiliResults.hits.map((result) => result.conversationId)
          : [];
        if (!matchingIds.length) {
          return { conversations: [], nextCursor: null };
        }
        filters.push({ conversationId: { $in: matchingIds } } as FilterQuery<IConversation>);
      } catch (error) {
        logger.error('[getConvosByCursor] Error during meiliSearch', error);
        throw new Error('Error during meiliSearch');
      }
    }

    const validSortFields = ['title', 'createdAt', 'updatedAt'];
    if (!validSortFields.includes(sortBy)) {
      throw new Error(
        `Invalid sortBy field: ${sortBy}. Must be one of ${validSortFields.join(', ')}`,
      );
    }
    const finalSortBy = sortBy;
    const finalSortDirection = sortDirection === 'asc' ? 'asc' : 'desc';

    let cursorFilter: FilterQuery<IConversation> | null = null;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
        const { primary, secondary } = decoded;
        const primaryValue = finalSortBy === 'title' ? primary : new Date(primary);
        const secondaryValue = new Date(secondary);
        const op = finalSortDirection === 'asc' ? '$gt' : '$lt';

        cursorFilter = {
          $or: [
            { [finalSortBy]: { [op]: primaryValue } },
            {
              [finalSortBy]: primaryValue,
              updatedAt: { [op]: secondaryValue },
            },
          ],
        } as FilterQuery<IConversation>;
      } catch {
        logger.warn('[getConvosByCursor] Invalid cursor format, starting from beginning');
      }
      if (cursorFilter) {
        filters.push(cursorFilter);
      }
    }

    const query: FilterQuery<IConversation> =
      filters.length === 1 ? filters[0] : ({ $and: filters } as FilterQuery<IConversation>);

    try {
      const sortOrder: SortOrder = finalSortDirection === 'asc' ? 1 : -1;
      const sortObj: Record<string, SortOrder> = { [finalSortBy]: sortOrder };

      if (finalSortBy !== 'updatedAt') {
        sortObj.updatedAt = sortOrder;
      }

      const convos = await Conversation.find(query)
        .select(
          'conversationId endpoint title createdAt updatedAt user model agent_id assistant_id spec iconURL',
        )
        .sort(sortObj)
        .limit(limit + 1)
        .lean();

      let nextCursor: string | null = null;
      if (convos.length > limit) {
        convos.pop();
        const lastReturned = convos[convos.length - 1] as Record<string, unknown>;
        const primaryValue = lastReturned[finalSortBy];
        const primaryStr =
          finalSortBy === 'title' ? primaryValue : (primaryValue as Date).toISOString();
        const secondaryStr = (lastReturned.updatedAt as Date).toISOString();
        const composite = { primary: primaryStr, secondary: secondaryStr };
        nextCursor = Buffer.from(JSON.stringify(composite)).toString('base64');
      }

      return { conversations: convos, nextCursor };
    } catch (error) {
      logger.error('[getConvosByCursor] Error getting conversations', error);
      throw new Error('Error getting conversations');
    }
  }

  /**
   * Fetches specific conversations by ID array with pagination.
   */
  async function getConvosQueried(
    user: string,
    convoIds: Array<{ conversationId: string }> | null,
    cursor: string | null = null,
    limit = 25,
  ) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      if (!convoIds?.length) {
        return { conversations: [], nextCursor: null, convoMap: {} };
      }

      const conversationIds = convoIds.map((convo) => convo.conversationId);

      const results = await Conversation.find({
        user,
        conversationId: { $in: conversationIds },
        $or: [{ expiredAt: { $exists: false } }, { expiredAt: null }],
      }).lean();

      results.sort(
        (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime(),
      );

      let filtered = results;
      if (cursor && cursor !== 'start') {
        const cursorDate = new Date(cursor);
        filtered = results.filter((convo) => new Date(convo.updatedAt ?? 0) < cursorDate);
      }

      const limited = filtered.slice(0, limit + 1);
      let nextCursor: string | null = null;
      if (limited.length > limit) {
        limited.pop();
        nextCursor = (limited[limited.length - 1].updatedAt as Date).toISOString();
      }

      const convoMap: Record<string, unknown> = {};
      limited.forEach((convo) => {
        convoMap[convo.conversationId] = convo;
      });

      return { conversations: limited, nextCursor, convoMap };
    } catch (error) {
      logger.error('[getConvosQueried] Error getting conversations', error);
      throw new Error('Error fetching conversations');
    }
  }

  /**
   * Gets conversation title, returning 'New Chat' as default.
   */
  async function getConvoTitle(user: string, conversationId: string) {
    try {
      const convo = await getConvo(user, conversationId);
      if (convo && !convo.title) {
        return null;
      } else {
        return convo?.title || 'New Chat';
      }
    } catch (error) {
      logger.error('[getConvoTitle] Error getting conversation title', error);
      throw new Error('Error getting conversation title');
    }
  }

  /**
   * Deletes conversations and their associated messages for a given user and filter.
   */
  async function deleteConvos(user: string, filter: FilterQuery<IConversation>) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const { deleteMessages } = getMessageMethods();
      const userFilter = { ...filter, user };
      const conversations = await Conversation.find(userFilter).select('conversationId');
      const conversationIds = conversations.map((c) => c.conversationId);

      if (!conversationIds.length) {
        throw new Error('Conversation not found or already deleted.');
      }

      const deleteConvoResult = await Conversation.deleteMany(userFilter);

      const deleteMessagesResult = await deleteMessages({
        conversationId: { $in: conversationIds },
      });

      return { ...deleteConvoResult, messages: deleteMessagesResult };
    } catch (error) {
      logger.error('[deleteConvos] Error deleting conversations and messages', error);
      throw error;
    }
  }

  return {
    getConvoFiles,
    searchConversation,
    deleteNullOrEmptyConversations,
    saveConvo,
    bulkSaveConvos,
    getConvosByCursor,
    getConvosQueried,
    getConvo,
    getConvoTitle,
    deleteConvos,
  };
}
