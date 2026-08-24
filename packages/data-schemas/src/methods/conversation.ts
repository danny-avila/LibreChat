import { RetentionMode } from 'librechat-data-provider';
import type { FilterQuery, Model, SortOrder, Types } from 'mongoose';
import type { DeleteResult } from 'mongoose';
import type {
  IAgentEventBindingRecord,
  AppConfig,
  IChatProjectDocument,
  IActiveSubagentThreadLease,
  IConversation,
  ISharedLink,
  ISubagentThreadReservation,
} from '~/types';
import type { MessageMethods } from './message';
import {
  activeExpirationFilter,
  buildRetentionVisibilityFilter,
  createFallbackRetentionDate,
} from '~/utils/retention';
import {
  refreshChatProjectStatsForUser,
  updateChatProjectLastConversationForUser,
} from './chatProject';
import { createTempChatExpirationDate } from '~/utils/tempChatRetention';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';
import { isValidObjectIdString } from '~/utils/objectId';
import { decrementTagCounts } from './conversationTag';
import logger from '~/config/winston';

type ConversationUpdateResult = {
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

export type SubagentThreadReadRecord = Pick<
  IConversation,
  | 'conversationId'
  | 'tenantId'
  | 'title'
  | 'agent_id'
  | 'updatedAt'
  | 'subagentThread'
  | 'subagentThreadLease'
> & {
  actorId?: string;
};

export type ParentSubagentThreadRecord = SubagentThreadReadRecord;

const ARCHIVE_CONVERSATION_BATCH_SIZE = 500;
const PROJECT_STATS_REFRESH_CONCURRENCY = 10;
const PROJECT_STATS_REFRESH_MAX_PASSES = 2;
const PROJECT_DISCOVERY_MAX_ATTEMPTS = 3;

const subagentThreadReadRecord = (conversation: IConversation): SubagentThreadReadRecord => ({
  conversationId: conversation.conversationId,
  ...(conversation.tenantId == null ? {} : { tenantId: conversation.tenantId }),
  ...(conversation.title == null ? {} : { title: conversation.title }),
  ...(conversation.agent_id == null ? {} : { agent_id: conversation.agent_id }),
  ...(conversation.updatedAt == null ? {} : { updatedAt: conversation.updatedAt }),
  ...(conversation.subagentThread == null ? {} : { subagentThread: conversation.subagentThread }),
  ...(conversation.subagentThreadLease == null
    ? {}
    : { subagentThreadLease: conversation.subagentThreadLease }),
  ...(conversation.agentEventBinding?.actorId == null
    ? {}
    : { actorId: conversation.agentEventBinding.actorId }),
});

async function discoverProjectIds(
  Conversation: Model<IConversation>,
  filter: FilterQuery<IConversation>,
): Promise<string[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PROJECT_DISCOVERY_MAX_ATTEMPTS; attempt++) {
    try {
      const currentProjectIds = await Conversation.distinct('chatProjectId', filter);
      return currentProjectIds.filter((projectId): projectId is string => Boolean(projectId));
    } catch (error) {
      lastError = error;
      logger.error('[archiveAllConvos] Conversations archived but project discovery failed', error);
    }
  }
  throw lastError;
}

/**
 * A project dropped here stays wrong forever: its chats are archived, so no retry of
 * archive-all can find them again to recompute against. The likeliest rejection is also
 * the most recoverable one, `refreshChatProjectStatsForUser` giving up after the project
 * changed under every compare-and-set attempt, so failures are collected and replayed
 * once the rest of the run has stopped competing with them.
 */
async function refreshChatProjectStatsInBatches(
  mongoose: typeof import('mongoose'),
  user: string,
  projectIds: Iterable<string>,
): Promise<void> {
  let pending = [...projectIds];
  for (let pass = 0; pass < PROJECT_STATS_REFRESH_MAX_PASSES && pending.length > 0; pass++) {
    const failed: string[] = [];
    for (let index = 0; index < pending.length; index += PROJECT_STATS_REFRESH_CONCURRENCY) {
      const batch = pending.slice(index, index + PROJECT_STATS_REFRESH_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((projectId) => refreshChatProjectStatsForUser(mongoose, user, projectId)),
      );
      for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
        const result = results[resultIndex];
        if (result.status === 'rejected') {
          failed.push(batch[resultIndex]);
          logger.error(
            `[refreshChatProjectStatsInBatches] Failed to refresh project ${batch[resultIndex]}`,
            result.reason,
          );
        }
      }
    }
    pending = failed;
  }

  if (pending.length > 0) {
    logger.error(
      `[refreshChatProjectStatsInBatches] Left ${pending.length} project(s) unreconciled: ${pending.join(', ')}`,
    );
  }
}

export interface ConversationMethods {
  getConvoFiles(conversationId: string): Promise<string[]>;
  searchConversation(
    conversationId: string,
    fieldsToSelect?: string | null,
  ): Promise<IConversation | null>;
  deleteNullOrEmptyConversations(): Promise<{
    conversations: { deletedCount?: number };
    messages: { deletedCount?: number };
  }>;
  saveConvo(
    ctx: {
      userId: string;
      isTemporary?: boolean;
      expiredAt?: Date;
      interfaceConfig?: AppConfig['interfaceConfig'];
    },
    data: { conversationId: string; newConversationId?: string; [key: string]: unknown },
    metadata?: {
      context?: string;
      unsetFields?: Record<string, number>;
      noUpsert?: boolean;
      createdAtOnInsert?: Date;
      preserveUpdatedAt?: boolean;
      /** `_id`s of messages this save just wrote. When present, they are appended with
       *  `$addToSet` and the O(n) read-and-rewrite of the `messages` array is skipped;
       *  every save without this option still rebuilds the array from the database. */
      appendMessageIds?: Types.ObjectId[];
    },
  ): Promise<IConversation | { message: string } | null>;
  setConvoPinned(
    user: string,
    conversationId: string,
    pinned: boolean,
  ): Promise<IConversation | null>;
  bulkSaveConvos(conversations: Array<Record<string, unknown>>): Promise<unknown>;
  getConvosByCursor(
    user: string,
    options?: {
      cursor?: string | null;
      limit?: number;
      isArchived?: boolean;
      pinned?: boolean;
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
  getSubagentThreadForParent(input: {
    user: string;
    parentConversationId: string;
    conversationId: string;
    tenantId?: string;
  }): Promise<SubagentThreadReadRecord | null>;
  listSubagentThreadsForParent(input: {
    user: string;
    parentConversationId: string;
    tenantId?: string;
    limit: number;
  }): Promise<ParentSubagentThreadRecord[]>;
  getAgentEventBinding(input: {
    user: string;
    bindingId: string;
    sourceKeyId: string;
    tenantId?: string;
  }): Promise<IAgentEventBindingRecord | null>;
  reserveSubagentThread(input: {
    user: string;
    conversationId: string;
    conversation: Partial<IConversation>;
    tenantId?: string;
  }): Promise<ISubagentThreadReservation>;
  acquireSubagentThreadLease(input: {
    user: string;
    conversationId: string;
    token: string;
    taskId: string;
    now: Date;
    expiresAt: Date;
    tenantId?: string;
  }): Promise<boolean>;
  renewSubagentThreadLease(input: {
    user: string;
    conversationId: string;
    token: string;
    now: Date;
    expiresAt: Date;
    tenantId?: string;
  }): Promise<boolean>;
  releaseSubagentThreadLease(input: {
    user: string;
    conversationId: string;
    token: string;
    tenantId?: string;
  }): Promise<boolean>;
  countActiveSubagentThreadLeases(input: {
    user: string;
    now: Date;
    tenantId?: string;
  }): Promise<number>;
  listActiveSubagentThreadLeases(input: {
    user: string;
    now: Date;
    tenantId?: string;
  }): Promise<IActiveSubagentThreadLease[]>;
  getConvoOwnership(
    user: string,
    conversationId: string,
    tenantId?: string | null,
  ): Promise<Pick<IConversation, 'user' | 'tenantId' | 'subagentThread'> | null>;
  getConvoRetention(
    user: string,
    conversationId: string,
  ): Promise<Pick<IConversation, 'expiredAt'> | null>;
  getConvoTitle(user: string, conversationId: string): Promise<string | null>;
  deleteConvos(
    user: string,
    filter: FilterQuery<IConversation>,
    options?: { beforeDelete?: (conversationIds: string[]) => Promise<void> },
  ): Promise<DeleteResult & { messages: DeleteResult; conversationIds: string[] }>;
  archiveAllConvos(user: string): Promise<{ archivedCount: number }>;
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

  /** Child threads are durable execution records, not user-navigable conversations. */
  function getHumanConversationFilter(): FilterQuery<IConversation> {
    return { subagentThread: { $exists: false } } as FilterQuery<IConversation>;
  }

  /**
   * Searches for a conversation by conversationId and returns a lean document with only conversationId and user.
   */
  /** `fieldsToSelect: null` returns the full document so one read can serve the whole request. */
  async function searchConversation(
    conversationId: string,
    fieldsToSelect: string | null = 'conversationId user',
  ) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return await Conversation.findOne({ conversationId }, fieldsToSelect).lean<IConversation>();
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

  /** Resolves a child only through its owning parent and includes its private live lease. */
  async function getSubagentThreadForParent(input: {
    user: string;
    parentConversationId: string;
    conversationId: string;
    tenantId?: string;
  }): Promise<SubagentThreadReadRecord | null> {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const conversation = await Conversation.findOne({
        user: input.user,
        conversationId: input.conversationId,
        'subagentThread.parentConversationId': input.parentConversationId,
        ...subagentLeaseTenantFilter(input.tenantId),
        ...activeExpirationFilter<IConversation>(),
      })
        .select(
          'conversationId tenantId title agent_id updatedAt subagentThread +subagentThreadLease +agentEventBinding',
        )
        .lean<IConversation>();
      if (conversation == null) return null;
      return subagentThreadReadRecord(conversation);
    } catch (error) {
      logger.error('[getSubagentThreadForParent] Error getting child conversation', error);
      throw new Error('Error getting child conversation');
    }
  }

  /**
   * Lists bounded child metadata through immutable parent lineage. Private
   * event-delivery records are collapsed to actor identity inside this Module.
   */
  async function listSubagentThreadsForParent(input: {
    user: string;
    parentConversationId: string;
    tenantId?: string;
    limit: number;
  }): Promise<ParentSubagentThreadRecord[]> {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const conversations = await Conversation.find({
        user: input.user,
        'subagentThread.parentConversationId': input.parentConversationId,
        ...subagentLeaseTenantFilter(input.tenantId),
        ...activeExpirationFilter<IConversation>(),
      })
        .select(
          'conversationId tenantId title agent_id updatedAt subagentThread +subagentThreadLease +agentEventBinding',
        )
        .sort({ updatedAt: -1, conversationId: 1, _id: 1 })
        .limit(input.limit)
        .lean<IConversation[]>();
      return conversations.map(subagentThreadReadRecord);
    } catch (error) {
      logger.error('[listSubagentThreadsForParent] Error listing child conversations', error);
      throw new Error('Error listing child conversations');
    }
  }

  /** Resolves an event target only when the API key, owner, and tenant all match. */
  async function getAgentEventBinding(input: {
    user: string;
    bindingId: string;
    sourceKeyId: string;
    tenantId?: string;
  }): Promise<IAgentEventBindingRecord | null> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const conversation = await Conversation.findOne({
      user: input.user,
      'agentEventBinding.bindingId': input.bindingId,
      'agentEventBinding.sourceKeyId': input.sourceKeyId,
      ...subagentLeaseTenantFilter(input.tenantId),
      ...activeExpirationFilter<IConversation>(),
    })
      .select(
        'conversationId agent_id tenantId isTemporary expiredAt subagentThread +agentEventBinding',
      )
      .lean<IConversation>();
    if (
      conversation?.agentEventBinding == null ||
      conversation.subagentThread == null ||
      typeof conversation.agent_id !== 'string'
    ) {
      return null;
    }
    return {
      conversationId: conversation.conversationId,
      agentId: conversation.agent_id,
      ...(conversation.tenantId == null ? {} : { tenantId: conversation.tenantId }),
      ...(conversation.isTemporary == null ? {} : { isTemporary: conversation.isTemporary }),
      ...(conversation.expiredAt == null ? {} : { expiredAt: conversation.expiredAt }),
      binding: conversation.agentEventBinding,
      lineage: conversation.subagentThread,
    };
  }

  /** Creates immutable child lineage exactly once without overwriting a concurrent winner. */
  async function reserveSubagentThread(input: {
    user: string;
    conversationId: string;
    conversation: Partial<IConversation>;
    tenantId?: string;
  }): Promise<ISubagentThreadReservation> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const filter = {
      user: input.user,
      conversationId: input.conversationId,
      ...(input.tenantId == null ? { tenantId: { $exists: false } } : { tenantId: input.tenantId }),
    };
    try {
      const result = (await Conversation.findOneAndUpdate(
        filter,
        {
          $setOnInsert: {
            ...input.conversation,
            user: input.user,
            conversationId: input.conversationId,
            messages: [],
          },
        },
        { new: true, upsert: true, includeResultMetadata: true, setDefaultsOnInsert: true },
      ).select('+agentEventBinding')) as unknown as ConversationUpdateResult;
      if (result.value == null) {
        throw new Error('Unable to reserve the subagent thread.');
      }
      return {
        conversation: result.value.toObject(),
        created: result.lastErrorObject?.updatedExisting !== true,
      };
    } catch (error) {
      /** Concurrent upserts can race at the unique index. The document that won is
       * the reservation; callers still validate its immutable lineage before use. */
      if ((error as { code?: number }).code === 11000) {
        const existing = await Conversation.findOne(filter)
          .select('+agentEventBinding')
          .lean<IConversation>();
        if (existing != null) {
          return { conversation: existing, created: false };
        }
      }
      throw error;
    }
  }

  function subagentLeaseTenantFilter(tenantId?: string): FilterQuery<IConversation> {
    return tenantId == null ? { tenantId: { $exists: false } } : { tenantId };
  }

  /** Atomically claims one durable child thread across all API replicas. */
  async function acquireSubagentThreadLease(input: {
    user: string;
    conversationId: string;
    token: string;
    taskId: string;
    now: Date;
    expiresAt: Date;
    tenantId?: string;
  }): Promise<boolean> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const result = await Conversation.updateOne(
      {
        user: input.user,
        conversationId: input.conversationId,
        subagentThread: { $exists: true },
        ...subagentLeaseTenantFilter(input.tenantId),
        $or: [
          { subagentThreadLease: { $exists: false } },
          { 'subagentThreadLease.expiresAt': { $lte: input.now } },
          { 'subagentThreadLease.token': input.token },
        ],
      },
      {
        $set: {
          subagentThreadLease: {
            token: input.token,
            taskId: input.taskId,
            expiresAt: input.expiresAt,
          },
          /** Child threads are hidden from normal recents. Stamp the task start
           * explicitly so bounded parent discovery promotes real new activity;
           * automatic timestamps stay disabled for lease heartbeats/releases. */
          updatedAt: input.now,
        },
      },
      { timestamps: false },
    );
    return result.matchedCount === 1;
  }

  /** Renews only the unexpired lease owned by this exact task token. */
  async function renewSubagentThreadLease(input: {
    user: string;
    conversationId: string;
    token: string;
    now: Date;
    expiresAt: Date;
    tenantId?: string;
  }): Promise<boolean> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const result = await Conversation.updateOne(
      {
        user: input.user,
        conversationId: input.conversationId,
        ...subagentLeaseTenantFilter(input.tenantId),
        'subagentThreadLease.token': input.token,
        'subagentThreadLease.expiresAt': { $gt: input.now },
      },
      { $set: { 'subagentThreadLease.expiresAt': input.expiresAt } },
      { timestamps: false },
    );
    return result.matchedCount === 1;
  }

  /** Releases only the lease owned by this exact task token. */
  async function releaseSubagentThreadLease(input: {
    user: string;
    conversationId: string;
    token: string;
    tenantId?: string;
  }): Promise<boolean> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const result = await Conversation.updateOne(
      {
        user: input.user,
        conversationId: input.conversationId,
        ...subagentLeaseTenantFilter(input.tenantId),
        'subagentThreadLease.token': input.token,
      },
      { $unset: { subagentThreadLease: 1 } },
      { timestamps: false },
    );
    return result.modifiedCount === 1;
  }

  /** Counts live child execution fences while account deletion drains. */
  async function countActiveSubagentThreadLeases(input: {
    user: string;
    now: Date;
    tenantId?: string;
  }): Promise<number> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    return Conversation.countDocuments({
      user: input.user,
      ...subagentLeaseTenantFilter(input.tenantId),
      'subagentThreadLease.expiresAt': { $gt: input.now },
    });
  }

  /** Resolves only live task addresses so account-wide cancellation stays O(active tasks). */
  async function listActiveSubagentThreadLeases(input: {
    user: string;
    now: Date;
    tenantId?: string;
  }): Promise<IActiveSubagentThreadLease[]> {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const conversations = await Conversation.find({
      user: input.user,
      ...subagentLeaseTenantFilter(input.tenantId),
      'subagentThreadLease.expiresAt': { $gt: input.now },
    })
      .select('conversationId subagentThread.parentConversationId +subagentThreadLease')
      .lean<
        Array<Pick<IConversation, 'conversationId' | 'subagentThread' | 'subagentThreadLease'>>
      >();
    return conversations.flatMap((conversation) => {
      const { conversationId } = conversation;
      const parentConversationId = conversation.subagentThread?.parentConversationId;
      const taskId = conversation.subagentThreadLease?.taskId;
      return typeof conversationId === 'string' &&
        conversationId !== '' &&
        typeof parentConversationId === 'string' &&
        parentConversationId !== '' &&
        typeof taskId === 'string' &&
        taskId !== ''
        ? [{ conversationId, parentConversationId, taskId }]
        : [];
    });
  }

  /**
   * Public-read probe: resolves ownership plus the child-thread discriminator
   * without materializing the full conversation document (preset spread +
   * message ObjectId array).
   */
  async function getConvoOwnership(user: string, conversationId: string, tenantId?: string | null) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const tenantFilter =
        tenantId === undefined ? {} : subagentLeaseTenantFilter(tenantId ?? undefined);
      return await Conversation.findOne(
        {
          user,
          conversationId,
          ...tenantFilter,
          ...activeExpirationFilter<IConversation>(),
        },
        'user tenantId subagentThread',
      ).lean<Pick<IConversation, 'user' | 'tenantId' | 'subagentThread'>>();
    } catch (error) {
      logger.error('[getConvoOwnership] Error checking conversation ownership', error);
      throw new Error('Error checking conversation ownership');
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
      expiredAt,
      interfaceConfig,
    }: {
      userId: string;
      isTemporary?: boolean;
      expiredAt?: Date;
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
      preserveUpdatedAt?: boolean;
      appendMessageIds?: Types.ObjectId[];
    },
  ) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const { getMessages } = getMessageMethods();

      if (metadata?.context) {
        logger.debug(`[saveConvo] ${metadata.context}`);
      }

      const appendMessageIds = metadata?.appendMessageIds;
      const update: Record<string, unknown> = { ...convo, user: userId };
      if (appendMessageIds == null) {
        update.messages = await getMessages({ conversationId, user: userId }, '_id');
      } else {
        delete update.messages;
      }
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

      if (expiredAt instanceof Date && !Number.isNaN(expiredAt.getTime())) {
        if (typeof isTemporary === 'boolean') {
          update.isTemporary = isTemporary;
        }
        update.expiredAt = expiredAt;
      } else if (interfaceConfig?.retentionMode === RetentionMode.ALL) {
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
      /**
       * Metadata-only edits (pinning) must not read as activity: the sidebar orders
       * chats by `updatedAt`, so bumping it would hoist an untouched chat to Today.
       */
      const preserveUpdatedAt = metadata?.preserveUpdatedAt === true;
      const updatesArchiveState = typeof update.isArchived === 'boolean';
      if (!preserveUpdatedAt && (createdAtOnInsert || updatesArchiveState)) {
        update.updatedAt = new Date();
      }

      const timestampOptions: { timestamps?: false } = {};
      if (updatesArchiveState || createdAtOnInsert || preserveUpdatedAt) {
        timestampOptions.timestamps = false;
      }

      const buildOperation = (setFields: Record<string, unknown>) => {
        const operation: Record<string, unknown> = { $set: setFields };
        if (appendMessageIds != null && appendMessageIds.length > 0) {
          operation.$addToSet = { messages: { $each: appendMessageIds } };
        }
        if (Object.keys(unsetFields).length > 0) {
          operation.$unset = unsetFields;
        }
        const createdAtForInsert = updatesArchiveState
          ? (createdAtOnInsert ??
            (!preserveUpdatedAt && update.updatedAt instanceof Date ? update.updatedAt : undefined))
          : createdAtOnInsert;
        if (createdAtForInsert) {
          operation.$setOnInsert = { createdAt: createdAtForInsert };
        }
        return operation;
      };

      const baseFilter = { conversationId, user: userId };
      const canUpsert = metadata?.noUpsert !== true;
      const runUpdate = (
        filter: Record<string, unknown>,
        operation: Record<string, unknown>,
        upsert: boolean,
      ) =>
        Conversation.findOneAndUpdate(filter, operation, {
          new: true,
          upsert,
          includeResultMetadata: true,
          ...timestampOptions,
        }) as unknown as Promise<ConversationUpdateResult>;

      let conversationResult: ConversationUpdateResult;
      if (update.isArchived === true) {
        /** DocumentDB documents no support for pipeline-form updates on any engine
         * version (`misc/documentdb/documentdb-compat.md`), so the stamp is applied
         * by compare-and-set instead of `$cond`. Matching on the flag is what keeps
         * it atomic: only the write that finds the chat unarchived stamps it, so a
         * duplicate or retried archive cannot move `archivedAt`, and an unarchive
         * that lands first is re-stamped rather than left bare. */
        const withoutStamp = { ...update };
        delete withoutStamp.archivedAt;
        const stamped = { ...withoutStamp, archivedAt: update.archivedAt ?? new Date() };

        const runArchiveWrites = async () => {
          const transitioned = await runUpdate(
            { ...baseFilter, isArchived: { $ne: true } },
            buildOperation(stamped),
            false,
          );
          if (transitioned.value) {
            return transitioned;
          }
          return runUpdate(
            { ...baseFilter, isArchived: true },
            buildOperation(withoutStamp),
            false,
          );
        };

        conversationResult = await runArchiveWrites();
        /** Both conditional writes miss when the flag flips between them: the chat was
         * already archived when the first ran and unarchived again before the second.
         * That is a live conversation, so confirm it is really gone before letting the
         * route answer 404, and retry the pair when it is not. */
        for (let attempt = 0; !conversationResult.value && attempt < 2; attempt++) {
          if (!(await Conversation.exists(baseFilter))) {
            break;
          }
          conversationResult = await runArchiveWrites();
        }
        if (!conversationResult.value && canUpsert) {
          conversationResult = await runUpdate(baseFilter, buildOperation(stamped), true);
        }
        if (!conversationResult.value) {
          /** Alternating archive and unarchive requests can split every attempt, so
           * exhausting the retries still proves nothing about whether the chat exists.
           * Answer with its actual current state rather than reporting it missing. */
          const current = await Conversation.findOne(baseFilter);
          if (current) {
            conversationResult = {
              value: current as unknown as ConversationUpdateResult['value'],
              lastErrorObject: { updatedExisting: true },
            };
          }
        }
      } else {
        conversationResult = await runUpdate(
          baseFilter,
          buildOperation(updatesArchiveState ? { ...update, archivedAt: null } : update),
          canUpsert,
        );
      }
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
        /* This backfill runs after the main write, so it needs the same timestamp
           suppression: otherwise the first pin or archive of a legacy chat under
           `RetentionMode.ALL` bumps `updatedAt` here and lands in Today anyway. */
        await Conversation.updateOne(
          { _id: conversation._id, isTemporary: { $ne: false } },
          { $set: { isTemporary: false } },
          preserveUpdatedAt ? { timestamps: false } : {},
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
        const isNewConversation = conversationResult.lastErrorObject?.updatedExisting === false;
        const shouldRefreshProjectStats =
          projectMembershipChanged ||
          isNewConversation ||
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
   * Flips the pinned flag on its own rather than routing through `saveConvo`.
   *
   * Pinning is pure metadata: it moves no chat between projects, changes nothing the
   * project workspace hides, and opens no retention window, so none of `saveConvo`'s
   * tail work applies. Going direct drops the `getMessages` round trip and the rewrite
   * of the whole message-id array that a one-field toggle would otherwise pay for, and
   * `timestamps: false` keeps the sidebar ordering by real activity.
   *
   * Returns null when no conversation matched, so a pin can never insert one.
   */
  async function setConvoPinned(user: string, conversationId: string, pinned: boolean) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return await Conversation.findOneAndUpdate(
        { conversationId, user },
        { $set: { pinned } },
        { new: true, timestamps: false },
      ).lean<IConversation>();
    } catch (error) {
      logger.error('[setConvoPinned] Error updating pinned state', error);
      throw new Error('Error updating pinned state');
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
   * Flags which conversations on a page currently have an active shared link, in one
   * batched lookup instead of a query per row. The flag lives in another collection, so
   * it is derived per request rather than projected; a failure here degrades the badge
   * but must never fail the conversation list itself.
   */
  async function attachSharedFlags(user: string, conversations: IConversation[]): Promise<void> {
    const SharedLink = mongoose.models.SharedLink as Model<ISharedLink> | undefined;
    if (!SharedLink || conversations.length === 0) {
      return;
    }
    /* A deployment with shared links off serves no links and renders no badge, so the
       extra round trip on the sidebar's first page would buy nothing. */
    const allowSharedLinks = process.env.ALLOW_SHARED_LINKS;
    if (allowSharedLinks !== undefined && allowSharedLinks.toLowerCase().trim() !== 'true') {
      return;
    }

    try {
      const shares = await SharedLink.find({
        user,
        conversationId: { $in: conversations.map((convo) => convo.conversationId) },
        ...activeExpirationFilter<ISharedLink>(),
      })
        .select('conversationId')
        .lean();

      const shared = new Set(shares.map((share) => share.conversationId));
      for (const convo of conversations) {
        convo.isShared = shared.has(convo.conversationId);
      }
    } catch (error) {
      logger.error('[attachSharedFlags] Error resolving shared conversations', error);
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
      pinned = false,
      tags,
      search,
      sortBy = 'updatedAt',
      sortDirection = 'desc',
      projectId,
    }: {
      cursor?: string | null;
      limit?: number;
      isArchived?: boolean;
      pinned?: boolean;
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

    if (pinned) {
      filters.push({ pinned: true } as FilterQuery<IConversation>);
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
    filters.push(getHumanConversationFilter());

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

    const validSortFields = ['title', 'createdAt', 'updatedAt', 'archivedAt'];
    if (!validSortFields.includes(sortBy)) {
      throw new Error(
        `Invalid sortBy field: ${sortBy}. Must be one of ${validSortFields.join(', ')}`,
      );
    }
    const finalSortBy = sortBy;
    const finalSortDirection = sortDirection === 'asc' ? 'asc' : 'desc';
    /* `title` and `archivedAt` are both absent on plenty of rows, and BSON orders a
       missing field before every string and every date alike. The paging clauses below
       therefore treat them the same way; `createdAt`/`updatedAt` are always present. */
    const sortFieldIsNullable = finalSortBy === 'title' || finalSortBy === 'archivedAt';
    /* The archive view renders `archivedAt ?? createdAt`, so the legacy group, which
       shares a missing `archivedAt`, has to be ordered by the same `createdAt` the cell
       shows rather than by last activity, or its dates read out of order. */
    const secondaryField = finalSortBy === 'archivedAt' ? 'createdAt' : 'updatedAt';

    let cursorFilter: FilterQuery<IConversation> | null = null;
    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
        const { primary, secondary, id } = decoded;
        const secondaryValue = new Date(secondary);
        const descending = finalSortDirection !== 'asc';
        const op = descending ? '$lt' : '$gt';
        const sortsBySecondary = finalSortBy === secondaryField;
        const boundaryId =
          typeof id === 'string' && isValidObjectIdString(id)
            ? { [op]: new mongoose.Types.ObjectId(id) }
            : null;

        /* One clause per sort level, so the page boundary is exact. Titles and
           timestamps both repeat; `_id` is the only field guaranteed to break the
           tie, and without that last clause every row sharing the boundary's
           (sort field, updatedAt) pair is skipped instead of returned. */
        const clauses: FilterQuery<IConversation>[] = [];

        /* A title or an archive stamp can be absent, and BSON orders a missing field
           before every string and date while `$lt`/`$gt` never cross that type
           boundary. Those rows therefore need clauses of their own: their own tail
           when the boundary is one of them, and the whole group when a descending
           page runs past the last non-null value. */
        if (primary == null) {
          clauses.push({ [finalSortBy]: null, [secondaryField]: { [op]: secondaryValue } });
          if (boundaryId) {
            clauses.push({
              [finalSortBy]: null,
              [secondaryField]: secondaryValue,
              _id: boundaryId,
            });
          }
          if (!descending) {
            clauses.push({ [finalSortBy]: { $ne: null } });
          }
        } else {
          const primaryValue = finalSortBy === 'title' ? primary : new Date(primary);
          clauses.push({ [finalSortBy]: { [op]: primaryValue } });
          if (!sortsBySecondary) {
            clauses.push({
              [finalSortBy]: primaryValue,
              [secondaryField]: { [op]: secondaryValue },
            });
          }
          if (boundaryId) {
            clauses.push({
              [finalSortBy]: primaryValue,
              ...(sortsBySecondary ? {} : { [secondaryField]: secondaryValue }),
              _id: boundaryId,
            });
          }
          if (descending && sortFieldIsNullable) {
            clauses.push({ [finalSortBy]: null });
          }
        }

        cursorFilter = { $or: clauses } as FilterQuery<IConversation>;
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

      if (finalSortBy !== secondaryField) {
        sortObj[secondaryField] = sortOrder;
      }
      sortObj._id = sortOrder;

      const convos = await Conversation.find(query)
        .select(
          'conversationId endpoint title createdAt updatedAt archivedAt user model agent_id assistant_id spec iconURL chatProjectId pinned',
        )
        .sort(sortObj)
        .limit(limit + 1)
        .lean<IConversation[]>();

      let nextCursor: string | null = null;
      if (convos.length > limit) {
        convos.pop();
        const lastReturned = convos[convos.length - 1];
        const sortValues: Record<string, string | Date | null | undefined> = {
          title: lastReturned.title,
          createdAt: lastReturned.createdAt,
          updatedAt: lastReturned.updatedAt,
          archivedAt: lastReturned.archivedAt,
        };
        const primaryValue = sortValues[finalSortBy];

        /* A null primary is what tells the next page it is inside the missing-value
           group, so an absent stamp has to survive as null rather than collapse to
           the epoch, which would page from 1970 and replay the whole archive. */
        let primaryStr: string | null = null;
        if (finalSortBy === 'title') {
          primaryStr = typeof primaryValue === 'string' ? primaryValue : null;
        } else if (primaryValue != null) {
          primaryStr = new Date(primaryValue).toISOString();
        }
        const secondaryValueOut =
          secondaryField === 'createdAt' ? lastReturned.createdAt : lastReturned.updatedAt;
        const secondaryStr = new Date(secondaryValueOut ?? 0).toISOString();
        const composite = {
          primary: primaryStr,
          secondary: secondaryStr,
          id: String(lastReturned._id),
        };
        nextCursor = Buffer.from(JSON.stringify(composite)).toString('base64');
      }

      await attachSharedFlags(user, convos);

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
        $and: [
          { user, conversationId: { $in: conversationIds } },
          getVisibleConversationRetentionFilter(),
          getHumanConversationFilter(),
        ],
      } as FilterQuery<IConversation>).lean<IConversation[]>();

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

      await attachSharedFlags(user, limited);

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
  async function deleteConvos(
    user: string,
    filter: FilterQuery<IConversation>,
    options?: { beforeDelete?: (conversationIds: string[]) => Promise<void> },
  ) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const { deleteMessages, getMessages } = getMessageMethods();
      const userFilter = { ...filter, user };
      type DeletionConversation = Pick<IConversation, 'conversationId' | 'chatProjectId' | 'tags'>;
      const retryCascadeOperation = async <T>(operation: () => PromiseLike<T> | T): Promise<T> => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            return await operation();
          } catch (error) {
            lastError = error;
            if (attempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
            }
          }
        }
        throw lastError;
      };
      let conversations = await Conversation.find(userFilter)
        .select('conversationId chatProjectId tags')
        .lean<DeletionConversation[]>();
      const recoveryConversationIds: string[] = [];
      if (!conversations.length && typeof filter.conversationId === 'string') {
        /** A prior attempt may have deleted the root before a descendant read failed.
         * Resume from immutable root lineage and retain the root id for message,
         * checkpoint, and tool cleanup. The message probe distinguishes that partial
         * commit from a conversation id that never existed. */
        const [descendants, rootMessages] = await Promise.all([
          retryCascadeOperation(() =>
            Conversation.find({
              user,
              'subagentThread.rootConversationId': filter.conversationId,
            })
              .select('conversationId chatProjectId tags')
              .lean<DeletionConversation[]>(),
          ),
          getMessages({ user, conversationId: filter.conversationId }, '_id', { limit: 1 }),
        ]);
        if (descendants.length === 0 && rootMessages.length === 0) {
          throw new Error('Conversation not found or already deleted.');
        }
        conversations = descendants;
        recoveryConversationIds.push(filter.conversationId);
      } else if (!conversations.length) {
        throw new Error('Conversation not found or already deleted.');
      }

      /**
       * Delete roots first, then walk their owner-scoped lineage. Apart from
       * making child threads share the parent's lifecycle, deleting each wave
       * before discovering the next closes the child-creation race: a creator
       * that started concurrently sees its parent disappear and rolls back,
       * while a child already committed is found by the next query.
       */
      const deletedConversations: DeletionConversation[] = [];
      const seen = new Set<string>();
      let pending = conversations;
      let acknowledged = true;
      let deletedCount = 0;
      const reconcileDeletedWave = async (
        wave: DeletionConversation[],
        waveDeletedCount: number,
      ): Promise<void> => {
        if (waveDeletedCount === 0) {
          return;
        }

        /**
         * Commit derived metadata while the deleted documents are still available in
         * memory. Descendant discovery can fail after this point; deferring the
         * reconciliation until the whole walk completes would make the root's tags and
         * project impossible to recover on a later retry.
         */
        const tagDecrements: string[] = [];
        for (const conversation of wave) {
          for (const tag of new Set(conversation.tags ?? [])) {
            tagDecrements.push(tag);
          }
        }
        await decrementTagCounts(mongoose, user, tagDecrements);

        const waveProjectIds = new Set(
          wave
            .map((conversation) => conversation.chatProjectId)
            .filter((projectId): projectId is string => Boolean(projectId)),
        );
        if (waveProjectIds.size > 0) {
          try {
            await refreshChatProjectStatsInBatches(mongoose, user, waveProjectIds);
          } catch (error) {
            logger.error('[deleteConvos] Conversations deleted but stats refresh failed', error);
          }
        }
      };
      while (pending.length > 0) {
        const wave = pending.filter((conversation) => !seen.has(conversation.conversationId));
        if (wave.length === 0) {
          break;
        }
        const waveIds = wave.map((conversation) => conversation.conversationId);
        await options?.beforeDelete?.(waveIds);
        const result = await Conversation.deleteMany({ user, conversationId: { $in: waveIds } });
        acknowledged &&= result.acknowledged;
        deletedCount += result.deletedCount;
        await reconcileDeletedWave(wave, result.deletedCount);
        for (const conversation of wave) {
          seen.add(conversation.conversationId);
          deletedConversations.push(conversation);
        }
        pending = await retryCascadeOperation(() =>
          Conversation.find({
            user,
            'subagentThread.parentConversationId': { $in: waveIds },
          })
            .select('conversationId chatProjectId tags')
            .lean<DeletionConversation[]>(),
        );
      }

      const conversationIds = [
        ...recoveryConversationIds,
        ...deletedConversations.map((conversation) => conversation.conversationId),
      ];

      const deleteConvoResult: DeleteResult = { acknowledged, deletedCount };

      /**
       * Post-delete cleanup is best-effort: the conversations are already gone, so a
       * thrown error here would hide the deletion from the caller — dropping the
       * `conversationIds` that downstream cleanup (e.g. agent-checkpoint pruning)
       * needs, with no way to recover them on retry (the query finds nothing).
       */
      let deleteMessagesResult: DeleteResult = { acknowledged: false, deletedCount: 0 };
      try {
        deleteMessagesResult = await deleteMessages({
          conversationId: { $in: conversationIds },
          user,
        });
      } catch (error) {
        logger.error('[deleteConvos] Conversations deleted but message cleanup failed', error);
      }

      // conversationIds lets callers run sibling cleanup that lives in higher layers
      // (e.g. pruning the conversations' durable agent checkpoints) without re-querying
      // documents that no longer exist.
      return { ...deleteConvoResult, messages: deleteMessagesResult, conversationIds };
    } catch (error) {
      logger.error('[deleteConvos] Error deleting conversations and messages', error);
      throw error;
    }
  }

  /**
   * Archives every conversation the user can currently see in one pass. Temporary and
   * retention-expired conversations are left alone: they are already hidden from the
   * chat list, so archiving them would only resurrect them in the archived view.
   */
  async function archiveAllConvos(user: string) {
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const projectIds = new Set<string>();
    /** One stamp for the whole sweep so the archived view groups the run together
     * instead of fanning it out across however long the batching took, and so the
     * recovery below can find everything this call committed without holding an id
     * per conversation in memory. */
    const archivedAt = new Date();
    let archivedCount = 0;
    /** A write whose result never came back may still have committed, so reconciliation
     * keys off the attempt rather than off `archivedCount`: a stepdown between commit and
     * acknowledgement would otherwise strand those chats with stale project counts, and no
     * retry can find them again because they no longer match the sweep filter. */
    let attemptedArchiveWrite = false;
    try {
      const filter = {
        user,
        $and: [
          { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] },
          getVisibleConversationRetentionFilter(),
          getHumanConversationFilter(),
        ],
      } as FilterQuery<IConversation>;

      const snapshotBoundary = await Conversation.findOne(filter)
        .select('_id')
        .sort({ _id: -1 })
        .lean<Pick<IConversation, '_id'>>();
      if (!snapshotBoundary) {
        return { archivedCount: 0 };
      }

      let lastConversationId: Types.ObjectId | null = null;

      while (true) {
        const idRange = lastConversationId
          ? { $gt: lastConversationId, $lte: snapshotBoundary._id }
          : { $lte: snapshotBoundary._id };
        const conversations = await Conversation.find({ ...filter, _id: idRange })
          .select('_id chatProjectId')
          .sort({ _id: 1 })
          .limit(ARCHIVE_CONVERSATION_BATCH_SIZE)
          .lean<Array<Pick<IConversation, '_id' | 'chatProjectId'>>>();
        if (conversations.length === 0) {
          break;
        }

        const conversationIds: Types.ObjectId[] = [];
        for (const conversation of conversations) {
          conversationIds.push(conversation._id);
          if (conversation.chatProjectId) {
            projectIds.add(conversation.chatProjectId);
          }
        }
        lastConversationId = conversationIds[conversationIds.length - 1];

        /**
         * `timestamps: false` keeps each conversation's own `updatedAt`, so the archived
         * view stays sorted by real activity instead of collapsing onto the archive time.
         * `archivedAt` is still stamped: the filter only matches unarchived chats, so this
         * cannot move an existing stamp, and leaving it unset would drop the whole sweep
         * into the legacy group the archived table sorts and dates by `createdAt`.
         */
        attemptedArchiveWrite = true;
        const result = await Conversation.updateMany(
          { ...filter, _id: { $in: conversationIds } },
          { $set: { isArchived: true, archivedAt } },
          { timestamps: false },
        );
        const batchArchivedCount = result.modifiedCount ?? 0;
        archivedCount += batchArchivedCount;

        if (batchArchivedCount > 0) {
          const currentProjectIds = await discoverProjectIds(Conversation, {
            _id: { $in: conversationIds },
            user,
          });
          for (const projectId of currentProjectIds) {
            projectIds.add(projectId);
          }
        }
      }

      return { archivedCount };
    } catch (error) {
      logger.error('[archiveAllConvos] Error archiving conversations', error);
      throw error;
    } finally {
      /**
       * Best-effort, mirroring `deleteConvos`: committed batches are already archived, so
       * a stats failure must not hide that from the caller. Recover destination projects
       * first, because in-loop discovery can throw after a move and a retry cannot see
       * those already-archived chats. The sweep marker is what identifies them, so this
       * costs one indexed query rather than a per-conversation id list: history size
       * changes how much this reads, never how much it holds.
       */
      if (attemptedArchiveWrite) {
        try {
          const recoveredProjectIds = await discoverProjectIds(Conversation, {
            user,
            isArchived: true,
            archivedAt,
          });
          for (const projectId of recoveredProjectIds) {
            projectIds.add(projectId);
          }
        } catch (error) {
          logger.error(
            '[archiveAllConvos] Conversations archived but project recovery failed',
            error,
          );
        }
      }
      if (attemptedArchiveWrite && projectIds.size > 0) {
        try {
          await refreshChatProjectStatsInBatches(mongoose, user, projectIds);
        } catch (error) {
          logger.error('[archiveAllConvos] Conversations archived but stats refresh failed', error);
        }
      }
    }
  }

  return {
    getConvoFiles,
    searchConversation,
    deleteNullOrEmptyConversations,
    saveConvo,
    setConvoPinned,
    bulkSaveConvos,
    getConvosByCursor,
    getConvosQueried,
    getConvo,
    getSubagentThreadForParent,
    listSubagentThreadsForParent,
    getAgentEventBinding,
    reserveSubagentThread,
    acquireSubagentThreadLease,
    renewSubagentThreadLease,
    releaseSubagentThreadLease,
    countActiveSubagentThreadLeases,
    listActiveSubagentThreadLeases,
    getConvoOwnership,
    getConvoRetention,
    getConvoTitle,
    deleteConvos,
    archiveAllConvos,
  };
}
