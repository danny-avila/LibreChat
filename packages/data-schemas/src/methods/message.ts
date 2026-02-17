import type { DeleteResult, FilterQuery, Model } from 'mongoose';
import logger from '~/config/winston';
import { createTempChatExpirationDate } from '~/utils/tempChatRetention';
import type { AppConfig, IMessage } from '~/types';

/** Simple UUID v4 regex to replace zod validation */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MessageMethods {
  saveMessage(
    ctx: { userId: string; isTemporary?: boolean; interfaceConfig?: AppConfig['interfaceConfig'] },
    params: Partial<IMessage> & { newMessageId?: string },
    metadata?: { context?: string },
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
  deleteMessagesSince(
    userId: string,
    params: { messageId: string; conversationId: string },
  ): Promise<DeleteResult>;
  getMessages(filter: FilterQuery<IMessage>, select?: string): Promise<IMessage[]>;
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
    metadata?: { context?: string },
  ) {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const conversationId = params.conversationId as string | undefined;
    if (!conversationId || !UUID_REGEX.test(conversationId)) {
      logger.warn(`Invalid conversation ID: ${conversationId}`);
      logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
      logger.info(`---Invalid conversation ID Params: ${JSON.stringify(params, null, 2)}`);
      return;
    }

    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const update: Record<string, unknown> = {
        ...params,
        user: userId,
        messageId: params.newMessageId || params.messageId,
      };

      if (isTemporary) {
        try {
          update.expiredAt = createTempChatExpirationDate(interfaceConfig);
        } catch (err) {
          logger.error('Error creating temporary chat expiration date:', err);
          logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
          update.expiredAt = null;
        }
      } else {
        update.expiredAt = null;
      }

      if (update.tokenCount != null && isNaN(update.tokenCount as number)) {
        logger.warn(
          `Resetting invalid \`tokenCount\` for message \`${params.messageId}\`: ${update.tokenCount}`,
        );
        logger.info(`---\`saveMessage\` context: ${metadata?.context}`);
        update.tokenCount = 0;
      }
      const message = await Message.findOneAndUpdate(
        { messageId: params.messageId, user: userId },
        update,
        { upsert: true, new: true },
      );

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
      const result = await Message.bulkWrite(bulkOps);
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
   * Deletes messages in a conversation since a specific message.
   */
  async function deleteMessagesSince(
    userId: string,
    { messageId, conversationId }: { messageId: string; conversationId: string },
  ) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const message = await Message.findOne({ messageId, user: userId }).lean();

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
  async function getMessages(filter: FilterQuery<IMessage>, select?: string) {
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      if (select) {
        return await Message.find(filter).select(select).sort({ createdAt: 1 }).lean();
      }

      return await Message.find(filter).sort({ createdAt: 1 }).lean();
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
      return await Message.findOne({ user, messageId }).lean();
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
      .lean();

    let nextCursor: string | null = null;
    if (messages.length > limit) {
      messages.pop();
      const last = messages[messages.length - 1] as Record<string, unknown>;
      nextCursor = String(last[sortField] ?? '');
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
    deleteMessagesSince,
    getMessages,
    getMessage,
    getMessagesByCursor,
    searchMessages,
    deleteMessages,
  };
}
