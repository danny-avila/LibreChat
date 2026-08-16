import { RetentionMode } from 'librechat-data-provider';
import type { FilterQuery, Model, SortOrder } from 'mongoose';
import type { DeleteResult } from 'mongoose';
import type { AppConfig, IChatProjectDocument, IConversation, ISharedLink } from '~/types';
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
      preserveUpdatedAt?: boolean;
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
  getConvoOwnership(
    user: string,
    conversationId: string,
  ): Promise<Pick<IConversation, 'user'> | null>;
  getConvoRetention(
    user: string,
    conversationId: string,
  ): Promise<Pick<IConversation, 'expiredAt'> | null>;
  getConvoTitle(user: string, conversationId: string): Promise<string | null>;
  deleteConvos(
    user: string,
    filter: FilterQuery<IConversation>,
  ): Promise<DeleteResult & { messages: DeleteResult; conversationIds: string[] }>;
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
   * Ownership probe for request validation: resolves only the owning user id
   * instead of materializing the full conversation document (preset spread +
   * message ObjectId array).
   */
  async function getConvoOwnership(user: string, conversationId: string) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      return await Conversation.findOne({ user, conversationId }, 'user').lean<
        Pick<IConversation, 'user'>
      >();
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
      preserveUpdatedAt?: boolean;
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
  async function deleteConvos(user: string, filter: FilterQuery<IConversation>) {
    try {
      const Conversation = mongoose.models.Conversation as Model<IConversation>;
      const { deleteMessages } = getMessageMethods();
      const userFilter = { ...filter, user };
      const conversations = await Conversation.find(userFilter).select(
        'conversationId chatProjectId tags',
      );
      const conversationIds = conversations.map((c) => c.conversationId);
      const projectIds = new Set(
        conversations
          .map((conversation) => conversation.chatProjectId)
          .filter((projectId): projectId is string => Boolean(projectId)),
      );

      /**
       * One entry per (conversation, tag) association: each conversation's tags are
       * deduped so a duplicate tag entry within a single conversation only decrements
       * the bookmark count once.
       */
      const tagDecrements: string[] = [];
      for (const conversation of conversations) {
        if (!conversation.tags?.length) {
          continue;
        }
        for (const tag of new Set(conversation.tags)) {
          tagDecrements.push(tag);
        }
      }

      if (!conversationIds.length) {
        throw new Error('Conversation not found or already deleted.');
      }

      const deleteConvoResult = await Conversation.deleteMany(userFilter);
      const deleted = deleteConvoResult.deletedCount > 0;

      /**
       * Reconcile bookmark counts from the deletion before message cleanup: if
       * `deleteMessages` later throws, the conversation is already gone and a retry
       * finds nothing, so the count must be reconciled here or it would stay stale.
       * The decrement is best-effort and never throws, so it cannot block message
       * cleanup. The `deletedCount` guard skips a losing concurrent delete whose
       * pre-delete snapshot would otherwise decrement a conversation it did not
       * actually remove.
       */
      if (deleted) {
        await decrementTagCounts(mongoose, user, tagDecrements);
      }

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

      /**
       * Refresh project stats after message cleanup so a stats-refresh error cannot
       * prevent `deleteMessages` from running, which would orphan the deleted
       * conversations' messages.
       */
      if (deleted && projectIds.size > 0) {
        try {
          await Promise.all(
            [...projectIds].map((projectId) =>
              refreshChatProjectStatsForUser(mongoose, user, projectId),
            ),
          );
        } catch (error) {
          logger.error('[deleteConvos] Conversations deleted but stats refresh failed', error);
        }
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
    getConvoOwnership,
    getConvoRetention,
    getConvoTitle,
    deleteConvos,
  };
}
