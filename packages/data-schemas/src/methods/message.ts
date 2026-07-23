import { RetentionMode } from 'librechat-data-provider';
import type { DeleteResult, FilterQuery, Model } from 'mongoose';
import type { AppConfig, IMessage } from '~/types';
import { createTempChatExpirationDate } from '~/utils/tempChatRetention';
import { createFallbackRetentionDate } from '~/utils/retention';
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
  updateToolCallResult(params: {
    userId: string;
    messageId: string;
    conversationId: string;
    toolCallId: string;
    agentId?: string;
    output?: string;
    attachments?: unknown[];
  }): Promise<{ matched: boolean; unfinished: boolean }>;
  updateMessage(
    userId: string,
    message: Partial<IMessage> & { newMessageId?: string },
    metadata?: { context?: string },
  ): Promise<Partial<IMessage>>;
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
    metadata?: { context?: string },
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

      if (interfaceConfig?.retentionMode === RetentionMode.ALL) {
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
   * Patches a persisted tool_call content part in place and appends attachments,
   * for results that settle after the turn's message was finalized (background
   * tool calls). Atomic single update so two tasks completing concurrently on
   * the same message cannot lose each other's attachments, and IDEMPOTENT
   * (attachments dedupe by `file_id ?? filepath`, scoped to this tool call so
   * sibling calls sharing a filename keep their own entries) so it can be
   * re-applied to heal a later full-row save that reverted the patch.
   *
   * Returns `matched: false` when the message row does not exist yet (the
   * dispatch turn has not finalized) and surfaces `unfinished` when the
   * matched row is a mid-turn partial save (client disconnect) — the eventual
   * finalize will overwrite the patch with in-memory content, so callers
   * should keep re-applying until a finalized row is patched.
   */
  async function updateToolCallResult({
    userId,
    messageId,
    conversationId,
    toolCallId,
    agentId,
    output,
    attachments,
  }: {
    userId: string;
    messageId: string;
    conversationId: string;
    toolCallId: string;
    /** Scopes the part match when provider tool-call ids repeat across
     *  agents in one response message (e.g. `call_0` per response); a part
     *  without agent identity matches any caller (single-agent runs). */
    agentId?: string;
    output?: string;
    attachments?: unknown[];
  }): Promise<{ matched: boolean; unfinished: boolean }> {
    const stages: Record<string, unknown>[] = [];
    if (output !== undefined) {
      stages.push({
        $set: {
          content: {
            $map: {
              input: { $ifNull: ['$content', []] },
              as: 'part',
              in: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$$part.type', 'tool_call'] },
                      { $eq: ['$$part.tool_call.id', toolCallId] },
                      ...(agentId != null
                        ? [
                            {
                              $in: [
                                { $ifNull: ['$$part.agentId', '$$part.tool_call.agentId'] },
                                [null, agentId],
                              ],
                            },
                          ]
                        : []),
                    ],
                  },
                  {
                    $mergeObjects: [
                      '$$part',
                      {
                        tool_call: {
                          $mergeObjects: ['$$part.tool_call', { output: { $literal: output } }],
                        },
                      },
                    ],
                  },
                  '$$part',
                ],
              },
            },
          },
        },
      });
    }
    if (attachments !== undefined && attachments.length > 0) {
      /** Dedupe key mirrors the resume merge: `file_id ?? filepath`, so
       *  download-fallback attachments (no `file_id`, only a filepath) stay
       *  idempotent across re-applications instead of duplicating per poll. */
      const attachmentKeys = attachments
        .map((attachment) => {
          const { file_id, filepath } = attachment as { file_id?: unknown; filepath?: unknown };
          return typeof file_id === 'string' ? file_id : filepath;
        })
        .filter((key): key is string => typeof key === 'string');
      stages.push({
        $set: {
          attachments: {
            $concatArrays: [
              {
                $filter: {
                  input: { $ifNull: ['$attachments', []] },
                  as: 'existing',
                  /** Replace only THIS tool call's prior entries: sibling calls
                   *  can legitimately share a `file_id` (the filename claim is
                   *  per-conversation), and the client anchors attachments to
                   *  cards by `toolCallId`. */
                  cond: {
                    $not: [
                      {
                        $and: [
                          {
                            $in: [
                              { $ifNull: ['$$existing.file_id', '$$existing.filepath'] },
                              { $literal: attachmentKeys },
                            ],
                          },
                          { $eq: ['$$existing.toolCallId', toolCallId] },
                          /** Provider tool-call ids repeat across agents in
                           *  handoff messages; a sibling agent's attachment
                           *  under the same id/key must survive (missing
                           *  agent identity = legacy wildcard). */
                          ...(agentId != null
                            ? [
                                {
                                  $in: [{ $ifNull: ['$$existing.agentId', null] }, [null, agentId]],
                                },
                              ]
                            : []),
                        ],
                      },
                    ],
                  },
                },
              },
              { $literal: attachments },
            ],
          },
        },
      });
    }
    if (stages.length === 0) {
      return { matched: false, unfinished: false };
    }
    try {
      const Message = mongoose.models.Message as Model<IMessage>;
      const result = await Message.findOneAndUpdate(
        { messageId, user: userId, conversationId },
        stages,
        { new: true, projection: { unfinished: 1 } },
      ).lean<{ unfinished?: boolean } | null>();
      return { matched: result != null, unfinished: result?.unfinished === true };
    } catch (err) {
      logger.error('Error updating tool call result:', err);
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
    updateToolCallResult,
    updateMessage,
    deleteMessagesSince,
    getMessages,
    getMessage,
    getMessagesByCursor,
    searchMessages,
    deleteMessages,
  };
}
