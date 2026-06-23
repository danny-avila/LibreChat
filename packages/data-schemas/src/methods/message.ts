import { RetentionMode, isForcedTemporaryRetention } from 'librechat-data-provider';
import type { DeleteResult, FilterQuery, Model } from 'mongoose';
import type { AppConfig, IConversation, IMessage, ISharedLink } from '~/types';
import {
  capForcedRetentionToParent,
  cascadeForcedConversationRetention,
  createFallbackRetentionDate,
} from '~/utils/retention';
import { createTempChatExpirationDate } from '~/utils/tempChatRetention';
import { tenantSafeBulkWrite } from '~/utils/tenantBulkWrite';
import logger from '~/config/winston';

/** Simple UUID v4 regex to replace zod validation */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MessageQueryOptions {
  limit?: number;
  sort?: Record<string, 1 | -1> | false;
}

export interface MessageMethods {
  saveMessage(
    ctx: { userId: string; isTemporary?: boolean; interfaceConfig?: AppConfig['interfaceConfig'] },
    params: Partial<IMessage> & { newMessageId?: string },
    metadata?: { context?: string; capExpiryToConversation?: boolean },
  ): Promise<IMessage | null | undefined>;
  bulkSaveMessages(
    messages: Array<Partial<IMessage>>,
    overrideTimestamp?: boolean,
  ): Promise<unknown>;
  recordMessage(params: {
    user: string;
    endpoint?: string;
    messageId: string;
    conversationId?: string;
    parentMessageId?: string;
    [key: string]: unknown;
  }): Promise<IMessage | null>;
  updateMessageText(userId: string, params: { messageId: string; text: string }): Promise<void>;
  updateMessage(
    userId: string,
    message: Partial<IMessage> & { newMessageId?: string },
    metadata?: { context?: string },
  ): Promise<Partial<IMessage>>;
  applyForcedRetention(
    ctx: { userId: string; interfaceConfig?: AppConfig['interfaceConfig'] },
    params: { conversationId: string; messageId?: string },
    metadata?: { context?: string; capExpiryToConversation?: boolean },
  ): Promise<void>;
  deleteMessagesSince(
    userId: string,
    params: { messageId: string; conversationId: string },
  ): Promise<DeleteResult>;
  getMessages(
    filter: FilterQuery<IMessage>,
    select?: string,
    options?: MessageQueryOptions,
  ): Promise<IMessage[]>;
  getMessage(params: { user: string; messageId: string }): Promise<IMessage | null>;
  getMessagesByCursor(
    filter: FilterQuery<IMessage>,
    options?: {
      sortField?: string;
      sortOrder?: 1 | -1;
      limit?: number;
      cursor?: string | null;
    },
  ): Promise<{ messages: IMessage[]; nextCursor: string | null }>;
  searchMessages(
    query: string,
    searchOptions: Partial<IMessage>,
    hydrate?: boolean,
  ): Promise<unknown>;
  deleteMessages(filter: FilterQuery<IMessage>): Promise<DeleteResult>;
}

export function createMessageMethods(mongoose: typeof import('mongoose')): MessageMethods {
  /**
   * Saves a message in the database.
   */
  async function saveMessage(
    {
      userId,
      isTemporary,
      interfaceConfig,
    }: {
      userId: string;
      isTemporary?: boolean;
      interfaceConfig?: AppConfig['interfaceConfig'];
    },
    params: Partial<IMessage> & { newMessageId?: string },
    metadata?: { context?: string; capExpiryToConversation?: boolean },
  ) {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const conversationId = params.conversationId as string | undefined;
    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      logger.warn(
        `Invalid conversation ID: ${conversationId} (context: ${metadata?.context ?? 'n/a'})`,
      );
      return;
    }

    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const update: Record<string, unknown> = {
        ...params,
        user: userId,
        messageId: params.newMessageId || params.messageId,
      };

      if (interfaceConfig?.retentionMode === RetentionMode.EPHEMERAL) {
        update.isTemporary = true;
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
          update.expiredAt = createFallbackRetentionDate();
        }
      } else if (interfaceConfig?.retentionMode === RetentionMode.ALL) {
        if (typeof isTemporary === 'boolean') {
          update.isTemporary = isTemporary;
        }
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
          update.expiredAt = createFallbackRetentionDate();
        }
      } else if (isTemporary === true) {
        update.isTemporary = true;
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
          update.expiredAt = createFallbackRetentionDate();
        }
      } else if (isTemporary === false) {
        update.isTemporary = false;
        update.expiredAt = null;
      }

      if (update.tokenCount != null && isNaN(update.tokenCount as number)) {
        logger.warn(
          `Resetting invalid \`tokenCount\` for message \`${params.messageId}\`: ${update.tokenCount}`,
        );
        logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
        update.tokenCount = 0;
      }

      const forcedExpiredAt = update.expiredAt;
      const isForcedRetention = isForcedTemporaryRetention(interfaceConfig?.retentionMode);
      /**
       * Message-only saves (branch/artifact/abort) never run `saveConvo`, so the new
       * message must not outlive a parent that already expires sooner. Callers that DO
       * refresh the conversation afterward must not opt in, otherwise the message keeps
       * the stale deadline and the TTL index deletes it before the refreshed conversation.
       */
      if (
        isForcedRetention &&
        forcedExpiredAt instanceof Date &&
        metadata?.capExpiryToConversation === true
      ) {
        const Conversation = mongoose.models.Conversation as Model<IConversation>;
        const SharedLink = mongoose.models.SharedLink as Model<ISharedLink>;
        update.expiredAt = await capForcedRetentionToParent(
          Conversation,
          Message,
          SharedLink,
          userId,
          conversationId,
          forcedExpiredAt,
        );
      }

      const message = await Message.findOneAndUpdate(
        { messageId: params.messageId, user: userId },
        update,
        { upsert: true, new: true },
      );

      if (
        interfaceConfig?.retentionMode === RetentionMode.ALL &&
        typeof isTemporary !== 'boolean' &&
        (message.isTemporary == null ||
          (message.isTemporary === false && message.$isDefault('isTemporary')))
      ) {
        await Message.updateOne(
          { _id: message._id, isTemporary: { $ne: false } },
          { $set: { isTemporary: false } },
        );
        message.isTemporary = false;
      }

      if (isForcedRetention && forcedExpiredAt instanceof Date) {
        const Conversation = mongoose.models.Conversation as Model<IConversation>;
        const SharedLink = mongoose.models.SharedLink as Model<ISharedLink>;
        await cascadeForcedConversationRetention(
          Conversation,
          Message,
          SharedLink,
          userId,
          conversationId,
          forcedExpiredAt,
        );
      }

      return message.toObject();
    } catch (err: unknown) {
      logger.error('Error saving message:', err);
      logger.info(`---\`saveMessage\` context: ${metadata?.context}`);

      const mongoErr = err as { code?: number; message?: string };
      if (mongoErr.code === 11000 && mongoErr.message?.includes('duplicate key error')) {
        logger.warn(`Duplicate messageId detected: ${params.messageId}. Continuing execution.`);

        try {
          const Message = mongoose.models.Message as Model<IMessage>;
          const existingMessage = await Message.findOne({
            messageId: params.messageId,
            user: userId,
          });

          if (existingMessage) {
            return existingMessage.toObject();
          }

          return undefined;
        } catch (findError) {
          logger.warn(
            `Could not retrieve existing message with ID ${params.messageId}: ${(findError as Error).message}`,
          );
          return undefined;
        }
      }

      throw err;
    }
  }

  /**
   * Saves multiple messages in bulk.
   */
  async function bulkSaveMessages(
    messages: Array<Record<string, unknown>>,
    overrideTimestamp = false,
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const bulkOps = messages.map((message) => ({
        updateOne: {
          filter: { messageId: message.messageId },
          update: message,
          timestamps: !overrideTimestamp,
          upsert: true,
        },
      }));
      const result = await tenantSafeBulkWrite(Message, bulkOps);
      return result;
    } catch (err) {
      logger.error('Error saving messages in bulk:', err);
      throw err;
    }
  }

  /**
   * Records a message in the database (no UUID validation).
   */
  async function recordMessage({
    user,
    endpoint,
    messageId,
    conversationId,
    parentMessageId,
    ...rest
  }: {
    user: string;
    endpoint?: string;
    messageId: string;
    conversationId?: string;
    parentMessageId?: string;
    [key: string]: unknown;
  }) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const message = {
        user,
        endpoint,
        messageId,
        conversationId,
        parentMessageId,
        ...rest,
      };

      return await Message.findOneAndUpdate({ user, messageId }, message, {
        upsert: true,
        new: true,
      });
    } catch (err) {
      logger.error('Error recording message:', err);
      throw err;
    }
  }

  /**
   * Updates the text of a message.
   */
  async function updateMessageText(
    userId: string,
    { messageId, text }: { messageId: string; text: string },
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      await Message.updateOne({ messageId, user: userId }, { text });
    } catch (err) {
      logger.error('Error updating message text:', err);
      throw err;
    }
  }

  /**
   * Updates a message and returns sanitized fields.
   */
  async function updateMessage(
    userId: string,
    message: { messageId: string; [key: string]: unknown },
    metadata?: { context?: string },
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const { messageId, ...update } = message;
      const updatedMessage = await Message.findOneAndUpdate({ messageId, user: userId }, update, {
        new: true,
      });

      if (!updatedMessage) {
        throw new Error('Message not found or user not authorized.');
      }

      return {
        messageId: updatedMessage.messageId,
        conversationId: updatedMessage.conversationId,
        parentMessageId: updatedMessage.parentMessageId,
        sender: updatedMessage.sender,
        text: updatedMessage.text,
        isCreatedByUser: updatedMessage.isCreatedByUser,
        tokenCount: updatedMessage.tokenCount,
        feedback: updatedMessage.feedback,
        endpoint: updatedMessage.endpoint,
      };
    } catch (err) {
      logger.error('Error updating message:', err);
      if (metadata?.context) {
        logger.info(`---\`updateMessage\` context: ${metadata.context}`);
      }
      throw err;
    }
  }

  /**
   * Enforces forced (ephemeral) retention on a conversation (and optionally a specific
   * message) that was touched outside `saveMessage`/`saveConvo` — message edits, feedback,
   * or bookmark-tag writes. Without these, an older permanent chat touched after an install
   * switches to ephemeral would stay visible and never expire. Omit `messageId` for
   * conversation-only writes (e.g. tag changes) to run just the conversation cascade.
   */
  async function applyForcedRetention(
    { userId, interfaceConfig }: { userId: string; interfaceConfig?: AppConfig['interfaceConfig'] },
    { conversationId, messageId }: { conversationId: string; messageId?: string },
    metadata?: { context?: string; capExpiryToConversation?: boolean },
  ): Promise<void> {
    if (!isForcedTemporaryRetention(interfaceConfig?.retentionMode)) {
      return;
    }

    let forcedExpiredAt: Date;
    try {
      forcedExpiredAt = createTempChatExpirationDate(interfaceConfig);
    } catch (err) {
      logger.error('Error creating temporary chat expiration date:', err);
      logger.info(`---\`applyForcedRetention\` context: ${metadata?.context}`);
      forcedExpiredAt = createFallbackRetentionDate();
    }

    const Message = mongoose.models.Message as Model<IMessage>;
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const SharedLink = mongoose.models.SharedLink as Model<ISharedLink>;

    if (metadata?.capExpiryToConversation === true) {
      forcedExpiredAt = await capForcedRetentionToParent(
        Conversation,
        Message,
        SharedLink,
        userId,
        conversationId,
        forcedExpiredAt,
      );
    }

    if (messageId) {
      await Message.updateOne(
        { messageId, user: userId },
        { $set: { isTemporary: true, expiredAt: forcedExpiredAt } },
      );
    }
    await cascadeForcedConversationRetention(
      Conversation,
      Message,
      SharedLink,
      userId,
      conversationId,
      forcedExpiredAt,
    );
  }

  /**
   * Deletes messages in a conversation since a specific message.
   */
  async function deleteMessagesSince(
    userId: string,
    { messageId, conversationId }: { messageId: string; conversationId: string },
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const message = await Message.findOne({ messageId, user: userId }).lean<IMessage>();

      if (message) {
        const query = Message.find({ conversationId, user: userId });
        return await query.deleteMany({
          createdAt: { $gt: message.createdAt },
        });
      }
      return undefined;
    } catch (err) {
      logger.error('Error deleting messages:', err);
      throw err;
    }
  }

  /**
   * Retrieves messages from the database.
   */
  async function getMessages(
    filter: FilterQuery<IMessage>,
    select?: string,
    options: MessageQueryOptions = {},
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const query = Message.find(filter);
      if (select) {
        query.select(select);
      }
      if (options.sort !== false) {
        query.sort(options.sort ?? { createdAt: 1 });
      }
      if (options.limit != null && options.limit > 0) {
        query.limit(options.limit);
      }

      return await query.lean<IMessage[]>();
    } catch (err) {
      logger.error('Error getting messages:', err);
      throw err;
    }
  }

  /**
   * Retrieves a single message from the database.
   */
  async function getMessage({ user, messageId }: { user: string; messageId: string }) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      return await Message.findOne({ user, messageId }).lean<IMessage>();
    } catch (err) {
      logger.error('Error getting message:', err);
      throw err;
    }
  }

  /**
   * Deletes messages from the database.
   */
  async function deleteMessages(filter: FilterQuery<IMessage>) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      return await Message.deleteMany(filter);
    } catch (err) {
      logger.error('Error deleting messages:', err);
      throw err;
    }
  }

  /**
   * Retrieves paginated messages with custom sorting and cursor support.
   */
  async function getMessagesByCursor(
    filter: FilterQuery<IMessage>,
    options: {
      sortField?: string;
      sortOrder?: 1 | -1;
      limit?: number;
      cursor?: string | null;
    } = {},
  ) {
    const Message = mongoose.models.Message as Model<IMessage>;
    const { sortField = 'createdAt', sortOrder = -1, limit = 25, cursor } = options;
    const queryFilter = { ...filter };
    if (cursor) {
      queryFilter[sortField] = sortOrder === 1 ? { $gt: cursor } : { $lt: cursor };
    }
    const messages = await Message.find(queryFilter)
      .sort({ [sortField]: sortOrder })
      .limit(limit + 1)
      .lean<IMessage[]>();

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      messages.pop();
      const last = messages[messages.length - 1];
      const cursorValue =
        sortField === 'createdAt' ? last.createdAt : last[sortField as keyof IMessage];
      nextCursor = String(cursorValue ?? '');
    }
    return { messages, nextCursor };
  }

  /**
   * Performs a MeiliSearch query on the Message collection.
   * Requires the meilisearch plugin to be registered on the Message model.
   */
  async function searchMessages(
    query: string,
    searchOptions: Record<string, unknown>,
    hydrate?: boolean,
  ) {
    const Message = mongoose.models.Message as Model<IMessage> & {
      meiliSearch?: (q: string, opts: Record<string, unknown>, h?: boolean) => Promise<unknown>;
    };
    if (typeof Message.meiliSearch !== 'function') {
      throw new Error('MeiliSearch plugin not registered on Message model');
    }
    return Message.meiliSearch(query, searchOptions, hydrate);
  }

  return {
    saveMessage,
    bulkSaveMessages,
    recordMessage,
    updateMessageText,
    updateMessage,
    applyForcedRetention,
    deleteMessagesSince,
    getMessages,
    getMessage,
    getMessagesByCursor,
    searchMessages,
    deleteMessages,
  };
}
