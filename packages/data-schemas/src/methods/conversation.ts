import { RetentionMode } from 'librechat-data-provider';
import type { FilterQuery, Model, SortOrder } from 'mongoose';
import type { DeleteResult } from 'mongoose';
import type { AppConfig, IChatProjectDocument, IConversation } from '~/types';
import type { MessageMethods } from './message';
import {
  refreshChatProjectStatsForUser,
  updateChatProjectLastConversationForUser,
} from './chatProject';
import { buildRetentionVisibilityFilter, createFallbackRetentionDate } from '~/utils/retention';
import { createTempChatExpirationDate } from '~/utils/tempChatRetention';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';
import { isValidObjectIdString } from '~/utils/objectId';
import logger from '~/config/winston';

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
    metadata?: {
      context?: string;
      unsetFields?: Record<string, number>;
      noUpsert?: boolean;
      createdAtOnInsert?: Date;
    },
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
      projectId?: string;
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
  getConvoRetention(
    user: string,
    conversationId: string,
  ): Promise<Pick<IConversation, 'expiredAt'> | null>;
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

  function getVisibleConversationRetentionFilter(): FilterQuery<IConversation> {
    return buildRetentionVisibilityFilter<IConversation>();
  }

  /**
   * Searches for a conversation by conversationId and returns a lean document with only conversationId and user.
   */
  async function searchConversation(conversationId: string) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return await Conversation.findOne(
        { conversationId },
        'conversationId user',
      ).lean<IConversation>();
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
      return await Conversation.findOne({ user, conversationId }).lean<IConversation>();
    } catch (error) {
      logger.error('[getConvo] Error getting single conversation', error);
      throw new Error('Error getting single conversation');
    }
  }

  /**
   * Retrieves only the retention deadline for a conversation.
   */
  async function getConvoRetention(
    user: string,
    conversationId: string,
  ): Promise<Pick<IConversation, 'expiredAt'> | null> {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return await Conversation.findOne({ user, conversationId }, 'expiredAt').lean<
        Pick<IConversation, 'expiredAt'>
      >();
    } catch (error) {
      logger.error('[getConvoRetention] Error getting conversation retention fields', error);
      throw new Error('Error getting conversation retention fields');
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
        (await Conversation.findOne({ conversationId }, 'files').lean<IConversation>())?.files ?? []
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
    metadata?: {
      context?: string;
      unsetFields?: Record<string, number>;
      noUpsert?: boolean;
      createdAtOnInsert?: Date;
    },
  ) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const { getMessages } = getMessageMethods();

      if (metadata?.context) {
        logger.debug(`[saveConvo] ${metadata.context}`);
      }

      const messages = await getMessages({ conversationId, user: userId }, '_id');
      const update: Record<string, unknown> = { ...convo, messages, user: userId };
      const unsetFields: Record<string, number> = { ...(metadata?.unsetFields ?? {}) };

      if (Object.prototype.hasOwnProperty.call(update, 'chatProjectId') && update.chatProjectId) {
        const chatProjectId = typeof update.chatProjectId === 'string' ? update.chatProjectId : '';
        let isValidChatProject = isValidObjectIdString(chatProjectId);

        if (isValidChatProject) {
          const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;
          const project = await ChatProject.exists({
            _id: new mongoose.Types.ObjectId(chatProjectId),
            user: userId,
          });
          isValidChatProject = project != null;
        }

        if (!isValidChatProject) {
          delete update.chatProjectId;
          unsetFields.chatProjectId = 1;
        }
      }

      const mayChangeProjectMembership =
        Object.prototype.hasOwnProperty.call(update, 'chatProjectId') ||
        Object.prototype.hasOwnProperty.call(unsetFields, 'chatProjectId');
      let previousChatProjectId: string | null = null;
      if (mayChangeProjectMembership) {
        const existing = await Conversation.findOne(
          { conversationId, user: userId },
          'chatProjectId',
        ).lean<{ chatProjectId?: string | null } | null>();
        previousChatProjectId = existing?.chatProjectId ?? null;
      }

      if (newConversationId) {
        update.conversationId = newConversationId;
      }

      if (interfaceConfig?.retentionMode === RetentionMode.ALL) {
        if (typeof isTemporary === 'boolean') {
          update.isTemporary = isTemporary;
        }
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveConvo\` context: ${metadata?.context}`);
          update.expiredAt = createFallbackRetentionDate();
        }
      } else if (isTemporary === true) {
        update.isTemporary = true;
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveConvo\` context: ${metadata?.context}`);
          update.expiredAt = createFallbackRetentionDate();
        }
      } else if (isTemporary === false) {
        update.isTemporary = false;
        update.expiredAt = null;
      }

      const createdAtOnInsert =
        metadata?.createdAtOnInsert instanceof Date &&
        !Number.isNaN(metadata.createdAtOnInsert.getTime())
          ? metadata.createdAtOnInsert
          : undefined;
      if (createdAtOnInsert) {
        update.updatedAt = new Date();
      }

      const updateOperation: Record<string, unknown> = { $set: update };
      if (Object.keys(unsetFields).length > 0) {
        updateOperation.$unset = unsetFields;
      }
      if (createdAtOnInsert) {
        updateOperation.$setOnInsert = { createdAt: createdAtOnInsert };
      }

      const conversationResult = (await Conversation.findOneAndUpdate(
        { conversationId, user: userId },
        updateOperation,
        {
          new: true,
          upsert: metadata?.noUpsert !== true,
          includeResultMetadata: true,
          ...(createdAtOnInsert ? { timestamps: false } : {}),
        },
      )) as unknown as {
        value:
          | (IConversation & {
              _id: unknown;
              $isDefault: (path: string) => boolean;
              toObject: () => IConversation;
            })
          | null;
        lastErrorObject?: {
          updatedExisting?: boolean;
        };
      };
      const conversation = conversationResult.value;

      if (!conversation) {
        logger.debug('[saveConvo] Conversation not found, skipping update');
        return null;
      }

      if (
        interfaceConfig?.retentionMode === RetentionMode.ALL &&
        typeof isTemporary !== 'boolean' &&
        (conversation.isTemporary == null ||
          (conversation.isTemporary === false && conversation.$isDefault('isTemporary')))
      ) {
        await Conversation.updateOne(
          { _id: conversation._id, isTemporary: { $ne: false } },
          { $set: { isTemporary: false } },
        );
        conversation.isTemporary = false;
      }

      const newChatProjectId = conversation.chatProjectId ?? null;
      const projectMembershipChanged = previousChatProjectId !== newChatProjectId;

      /**
       * A chat that moved between projects (e.g. a stale tab re-submitting an
       * older project id) must fully recompute the stats of the project it left;
       * the incremental path only ever touches the project it now belongs to.
       */
      if (projectMembershipChanged && previousChatProjectId) {
        await refreshChatProjectStatsForUser(mongoose, userId, previousChatProjectId);
      }

      if (conversation.chatProjectId) {
        const isRetentionVisibilityUpdate =
          typeof update.isTemporary === 'boolean' ||
          Object.prototype.hasOwnProperty.call(convo, 'expiredAt') ||
          Object.prototype.hasOwnProperty.call(unsetFields, 'isTemporary') ||
          Object.prototype.hasOwnProperty.call(unsetFields, 'expiredAt');
        /**
         * Saving a conversation that is itself archived or retention-hidden (e.g.
         * renaming or title generation on an archived project chat) must recompute
         * stats rather than take the incremental fast path, otherwise the project's
         * lastConversationAt/Id would point at a chat the project workspace hides.
         */
        const isConversationHidden =
          conversation.isArchived === true ||
          conversation.isTemporary === true ||
          (conversation.expiredAt != null &&
            new Date(conversation.expiredAt).getTime() <= Date.now());
        /**
         * A move into this project (projectMembershipChanged) also needs a full
         * refresh: the incremental path only bumps the count for brand-new inserts,
         * so a pre-existing chat joining the project would otherwise be uncounted.
         */
        const shouldRefreshProjectStats =
          projectMembershipChanged ||
          typeof update.isArchived === 'boolean' ||
          Object.prototype.hasOwnProperty.call(unsetFields, 'isArchived') ||
          isRetentionVisibilityUpdate ||
          isConversationHidden;

        if (shouldRefreshProjectStats) {
          await refreshChatProjectStatsForUser(mongoose, userId, conversation.chatProjectId);
        } else {
          await updateChatProjectLastConversationForUser(
            mongoose,
            userId,
            conversation.chatProjectId,
            conversation,
            conversationResult.lastErrorObject?.updatedExisting === false,
          );
        }
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
      const ChatProject = mongoose.models.ChatProject as Model<IChatProjectDocument>;

      /**
       * Validate project ownership before persisting (mirrors saveConvo). Bulk
       * paths like import/duplicate/fork can carry a chatProjectId that does not
       * belong to the user; persisting it would create an orphan assignment that
       * is hidden from both the project and the unassigned filter.
       */
      const candidatePairs = new Map<string, { user: string; projectId: string }>();
      for (const convo of conversations) {
        if (
          typeof convo.user === 'string' &&
          typeof convo.chatProjectId === 'string' &&
          isValidObjectIdString(convo.chatProjectId)
        ) {
          candidatePairs.set(`${convo.user}:${convo.chatProjectId}`, {
            user: convo.user,
            projectId: convo.chatProjectId,
          });
        }
      }

      const ownedProjects = new Set<string>();
      if (candidatePairs.size > 0) {
        const owned = await ChatProject.find({
          $or: [...candidatePairs.values()].map(({ user, projectId }) => ({
            _id: new mongoose.Types.ObjectId(projectId),
            user,
          })),
        })
          .select('_id user')
          .lean<Array<{ _id: { toString: () => string }; user: string }>>();
        for (const project of owned) {
          ownedProjects.add(`${project.user}:${project._id.toString()}`);
        }
      }

      /**
       * Capture each conversation's existing project so a bulk move (import that
       * overwrites an existing (user, conversationId), duplicate/fork) also refreshes
       * the project it leaves, not just the one it joins. One batched read keeps this
       * O(1) in round-trips regardless of batch size.
       */
      const previousProjectByConversation = new Map<string, string>();
      const conversationPairs = conversations
        .filter((c) => typeof c.user === 'string' && typeof c.conversationId === 'string')
        .map((c) => ({ user: c.user as string, conversationId: c.conversationId as string }));
      if (conversationPairs.length > 0) {
        const existing = await Conversation.find(
          { $or: conversationPairs },
          'user conversationId chatProjectId',
        ).lean<Array<{ user: string; conversationId: string; chatProjectId?: string | null }>>();
        for (const doc of existing) {
          if (doc.chatProjectId) {
            previousProjectByConversation.set(
              `${doc.user}:${doc.conversationId}`,
              doc.chatProjectId,
            );
          }
        }
      }

      const affectedProjectStats = new Map<string, { user: string; projectId: string }>();
      const bulkOps = conversations.map((convo) => {
        const sanitized = { ...convo };
        if (typeof sanitized.user === 'string' && typeof sanitized.chatProjectId === 'string') {
          if (ownedProjects.has(`${sanitized.user}:${sanitized.chatProjectId}`)) {
            affectedProjectStats.set(`${sanitized.user}:${sanitized.chatProjectId}`, {
              user: sanitized.user,
              projectId: sanitized.chatProjectId,
            });
          } else {
            sanitized.chatProjectId = null;
          }
        }
        if (typeof sanitized.user === 'string' && typeof sanitized.conversationId === 'string') {
          const previousProjectId = previousProjectByConversation.get(
            `${sanitized.user}:${sanitized.conversationId}`,
          );
          const newProjectId =
            typeof sanitized.chatProjectId === 'string' ? sanitized.chatProjectId : null;
          if (previousProjectId && previousProjectId !== newProjectId) {
            affectedProjectStats.set(`${sanitized.user}:${previousProjectId}`, {
              user: sanitized.user,
              projectId: previousProjectId,
            });
          }
        }
        return {
          updateOne: {
            filter: {
              conversationId: sanitized.conversationId,
              user: sanitized.user,
            },
            update: sanitized,
            upsert: true,
            timestamps: false,
          },
        };
      });

      const result = await tenantSafeBulkWrite(Conversation, bulkOps);
      await Promise.all(
        [...affectedProjectStats.values()].map(({ user, projectId }) =>
          refreshChatProjectStatsForUser(mongoose, user, projectId),
        ),
      );
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
      projectId,
    }: {
      cursor?: string | null;
      limit?: number;
      isArchived?: boolean;
      tags?: string[];
      search?: string;
      sortBy?: string;
      sortDirection?: string;
      projectId?: string;
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

    if (projectId === 'unassigned') {
      filters.push({
        $or: [{ chatProjectId: null }, { chatProjectId: { $exists: false } }],
      } as FilterQuery<IConversation>);
    } else if (projectId) {
      filters.push({ chatProjectId: projectId } as FilterQuery<IConversation>);
    }

    filters.push(getVisibleConversationRetentionFilter());

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
          'conversationId endpoint title createdAt updatedAt user model agent_id assistant_id spec iconURL chatProjectId pinned',
        )
        .sort(sortObj)
        .limit(limit + 1)
        .lean<IConversation[]>();

      let nextCursor: string | null = null;
      if (convos.length > limit) {
        convos.pop();
        const lastReturned = convos[convos.length - 1];
        let primaryValue: string | Date | undefined = lastReturned.updatedAt;
        if (finalSortBy === 'title') {
          primaryValue = lastReturned.title;
        } else if (finalSortBy === 'createdAt') {
          primaryValue = lastReturned.createdAt;
        }
        const primaryStr =
          finalSortBy === 'title' ? primaryValue : new Date(primaryValue ?? 0).toISOString();
        const secondaryStr = new Date(lastReturned.updatedAt ?? 0).toISOString();
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
        ...getVisibleConversationRetentionFilter(),
      }).lean<IConversation[]>();

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
      const conversations = await Conversation.find(userFilter).select(
        'conversationId chatProjectId',
      );
      const conversationIds = conversations.map((c) => c.conversationId);
      const projectIds = new Set(
        conversations
          .map((conversation) => conversation.chatProjectId)
          .filter((projectId): projectId is string => Boolean(projectId)),
      );

      if (!conversationIds.length) {
        throw new Error('Conversation not found or already deleted.');
      }

      const deleteConvoResult = await Conversation.deleteMany(userFilter);

      const deleteMessagesResult = await deleteMessages({
        conversationId: { $in: conversationIds },
        user,
      });

      await Promise.all(
        [...projectIds].map((projectId) =>
          refreshChatProjectStatsForUser(mongoose, user, projectId),
        ),
      );

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
    getConvoRetention,
    getConvoTitle,
    deleteConvos,
  };
}
