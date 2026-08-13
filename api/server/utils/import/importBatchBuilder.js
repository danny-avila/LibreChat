const { v4: uuidv4 } = require('uuid');
const {
  logger,
  createFallbackRetentionDate,
  createTempChatExpirationDate,
} = require('@librechat/data-schemas');
const {
  EModelEndpoint,
  Constants,
  RetentionMode,
  openAISettings,
} = require('librechat-data-provider');
const {
  deleteMessages,
  bulkSaveConvos,
  bulkSaveMessages,
  bulkIncrementTagCounts,
} = require('~/models');
const { FALLBACK_MODEL_BY_ENDPOINT } = require('./defaults');

/**
 * Factory function for creating an instance of ImportBatchBuilder.
 * @param {string} requestUserId - The ID of the user making the request.
 * @param {object} [interfaceConfig] - Runtime interface config for import retention.
 * @param {object} [options] - Builder options.
 * @param {number} [options.flushThreshold=250] - Number of buffered conversations that triggers an automatic flush.
 * @returns {ImportBatchBuilder} - The newly created ImportBatchBuilder instance.
 */
function createImportBatchBuilder(requestUserId, interfaceConfig, options) {
  return new ImportBatchBuilder(requestUserId, interfaceConfig, options);
}

/**
 * Class for building a batch of conversations and messages and pushing them to DB for Conversation Import functionality
 */
class ImportBatchBuilder {
  /**
   * Creates an instance of ImportBatchBuilder.
   * @param {string} requestUserId - The ID of the user making the import request.
   * @param {object} [interfaceConfig] - Runtime interface config for import retention.
   * @param {object} [options] - Builder options.
   * @param {number} [options.flushThreshold=250] - Number of buffered conversations that triggers an automatic flush.
   */
  constructor(requestUserId, interfaceConfig, options = {}) {
    this.requestUserId = requestUserId;
    this.interfaceConfig = interfaceConfig;
    this.conversations = [];
    this.messages = [];
    this.retentionFields = undefined;
    this.flushThreshold = options.flushThreshold ?? 250;
  }

  getRetentionFields() {
    if (this.retentionFields !== undefined) {
      return this.retentionFields;
    }

    if (this.interfaceConfig?.retentionMode !== RetentionMode.ALL) {
      this.retentionFields = {};
      return this.retentionFields;
    }

    try {
      this.retentionFields = {
        isTemporary: false,
        expiredAt: createTempChatExpirationDate(this.interfaceConfig),
      };
    } catch (error) {
      logger.error('[ImportBatchBuilder] Error creating import expiration date:', error);
      this.retentionFields = { isTemporary: false, expiredAt: createFallbackRetentionDate() };
    }
    return this.retentionFields;
  }

  /**
   * Starts a new conversation in the batch.
   * @param {string} [endpoint=EModelEndpoint.openAI] - The endpoint for the conversation. Defaults to EModelEndpoint.openAI.
   * @returns {void}
   */
  startConversation(endpoint) {
    // we are simplifying by using a single model for the entire conversation
    this.endpoint = endpoint || EModelEndpoint.openAI;
    this.conversationId = uuidv4();
    this.lastMessageId = Constants.NO_PARENT;
  }

  /**
   * Adds a user message to the current conversation.
   * @param {string} text - The text of the user message.
   * @returns {object} The saved message object.
   */
  addUserMessage(text) {
    const message = this.saveMessage({ text, sender: 'user', isCreatedByUser: true });
    return message;
  }

  /**
   * Adds a GPT message to the current conversation.
   * @param {string} text - The text of the GPT message.
   * @param {string} [model='defaultModel'] - The model used for generating the GPT message. Defaults to 'defaultModel'.
   * @param {string} [sender='GPT-3.5'] - The sender of the GPT message. Defaults to 'GPT-3.5'.
   * @returns {object} The saved message object.
   */
  addGptMessage(text, model, sender = 'GPT-3.5') {
    const message = this.saveMessage({
      text,
      sender,
      isCreatedByUser: false,
      model: model || openAISettings.model.default,
    });
    return message;
  }

  /**
   * Finishes the current conversation and adds it to the batch.
   * @param {string} [title='Imported Chat'] - The title of the conversation. Defaults to 'Imported Chat'.
   * @param {Date} [createdAt] - The creation date of the conversation.
   * @param {TConversation} [originalConvo] - The original conversation.
   * @param {string} [defaultModel] - Resolved default model for this endpoint
   *   (typically derived from the runtime models config). Used only when
   *   originalConvo.model is unset.
   * @returns {{ conversation: TConversation, messages: TMessage[] }} The resulting conversation and messages.
   */
  finishConversation(title, createdAt, originalConvo = {}, defaultModel) {
    const fallbackModel =
      defaultModel ?? FALLBACK_MODEL_BY_ENDPOINT[this.endpoint] ?? openAISettings.model.default;
    const convo = {
      ...originalConvo,
      user: this.requestUserId,
      conversationId: this.conversationId,
      title: title || 'Imported Chat',
      createdAt: createdAt,
      updatedAt: createdAt,
      overrideTimestamp: true,
      endpoint: this.endpoint,
      model: originalConvo.model ?? fallbackModel,
      ...this.getRetentionFields(),
    };
    convo._id && delete convo._id;
    /** `convoSchema` declares `importedFrom.externalId` required, but every
     * import writes through `bulkSaveConvos`, whose `updateOne` upserts run no
     * validators. An export whose own conversation id is missing or wrongly
     * typed would otherwise store a marker that violates its own schema. The
     * marker is dropped rather than half-filled: an id-less conversation is
     * not dedupable either way, because `loadExistingExternalIds` skips falsy
     * ids when it reads the markers back. */
    const externalId = convo.importedFrom?.externalId;
    if (convo.importedFrom && (typeof externalId !== 'string' || externalId.length === 0)) {
      delete convo.importedFrom;
    }
    this.conversations.push(convo);

    return { conversation: convo, messages: this.messages };
  }

  /**
   * Flushes whatever conversations and messages are currently buffered to the DB.
   * Also increments tag counts for any existing tags.
   * Clears the buffers before awaiting the writes so a concurrent saveMessage
   * call cannot be silently dropped or double-written.
   * Messages are written before conversations, deliberately: the conversation
   * record is the idempotency marker a retry uses to skip already-imported
   * data, so it must not exist until its messages are durably saved. Writing
   * conversations first (or concurrently) risks an empty, unrecoverable
   * conversation if the message write fails after the conversation write
   * succeeds.
   * @returns {Promise<void>} A promise that resolves when the flush completes.
   * @throws {Error} If there is an error saving the batch.
   */
  async flush() {
    if (this.conversations.length === 0 && this.messages.length === 0) {
      return;
    }

    const conversations = this.conversations;
    const messages = this.messages;
    this.conversations = [];
    this.messages = [];

    /** The only window in which cleanup is provably safe. No conversation
     * write has been issued yet, so nothing can point at these messages now or
     * later, whatever partial state the rejected message write left behind. */
    try {
      await bulkSaveMessages(messages, true);
    } catch (error) {
      logger.error('Error saving batch messages', error);
      await this.discardOrphanedMessages(messages);
      throw error;
    }

    /** Past this point the outcome of the conversation write is unknowable
     * from a rejection alone: a bulk write can commit and still reject (write
     * concern timeout, a dropped response, a partially applied batch). Deleting
     * the messages on that rejection turns a committed conversation into a
     * permanently empty one, which is worse than the orphaned rows it was
     * meant to avoid, so nothing is removed here. Tag maintenance runs after
     * for the same reason: it can only fail once the commit markers exist.
     */
    await bulkSaveConvos(conversations);
    await bulkIncrementTagCounts(
      this.requestUserId,
      conversations.flatMap((convo) => convo.tags),
    );
    logger.debug(
      `user: ${this.requestUserId} | Added ${conversations.length} conversations and ${messages.length} messages to the DB.`,
    );
  }

  /**
   * Removes messages whose conversations were never written. Messages are
   * written first on purpose, so a message write that fails before any
   * conversation write leaves rows no conversation points at: invisible to the
   * user, not skipped by a retry (every run mints fresh message ids), and so
   * duplicated on every re-import.
   *
   * Only ever called from that one window. Once `bulkSaveConvos` has been
   * issued the messages may belong to a committed conversation and are kept,
   * because no existence probe can settle it: reading the conversations back
   * answers a different question than "did this write commit", and the
   * retention-aware readers hide exactly the temporary and expired
   * conversations an import creates.
   *
   * Scoped to this user and to the freshly minted ids this flush wrote. Best
   * effort, and never allowed to mask the original failure.
   * @param {Array<{ messageId: string }>} messages - the messages this flush wrote
   */
  async discardOrphanedMessages(messages) {
    if (messages.length === 0) {
      return;
    }
    try {
      await deleteMessages({
        user: this.requestUserId,
        messageId: { $in: messages.map(({ messageId }) => messageId) },
      });
    } catch (cleanupError) {
      logger.error(
        `user: ${this.requestUserId} | Could not remove the messages of a failed import batch`,
        cleanupError,
      );
    }
  }

  /**
   * Flushes the buffered batch once the number of buffered conversations
   * reaches flushThreshold. Intended to be called periodically while importing
   * to bound peak memory and Mongo op size.
   * @returns {Promise<boolean>} Whether a flush actually ran. Callers that
   *   promote bookkeeping on commit (the importer's asset claims) need to know
   *   the difference between "buffered" and "written".
   */
  async maybeFlush() {
    if (this.conversations.length < this.flushThreshold) {
      return false;
    }
    await this.flush();
    return true;
  }

  /**
   * Saves whatever remains in the batch to the DB. Safe to call on an empty
   * builder, in which case it is a no-op.
   * @returns {Promise<void>} A promise that resolves when the batch is saved.
   * @throws {Error} If there is an error saving the batch.
   */
  async saveBatch() {
    await this.flush();
  }

  /**
   * Saves a message to the current conversation.
   * @param {object} messageDetails - The details of the message.
   * @param {string} messageDetails.text - The text of the message.
   * @param {string} messageDetails.sender - The sender of the message.
   * @param {string} [messageDetails.messageId] - The ID of the current message.
   * @param {boolean} messageDetails.isCreatedByUser - Indicates whether the message is created by the user.
   * @param {string} [messageDetails.model] - The model used for generating the message.
   * @param {string} [messageDetails.endpoint] - The endpoint used for generating the message.
   * @param {string} [messageDetails.parentMessageId=this.lastMessageId] - The ID of the parent message.
   * @param {Partial<TMessage>} messageDetails.rest - Additional properties that may be included in the message.
   * @returns {object} The saved message object.
   */
  saveMessage({
    text,
    sender,
    isCreatedByUser,
    model,
    messageId,
    parentMessageId = this.lastMessageId,
    endpoint,
    ...rest
  }) {
    const newMessageId = messageId ?? uuidv4();
    const message = {
      ...rest,
      parentMessageId,
      messageId: newMessageId,
      conversationId: this.conversationId,
      isCreatedByUser: isCreatedByUser,
      model: model || this.model,
      user: this.requestUserId,
      endpoint: endpoint ?? this.endpoint,
      unfinished: false,
      isEdited: false,
      error: false,
      sender,
      text,
      ...this.getRetentionFields(),
    };
    message._id && delete message._id;
    this.lastMessageId = newMessageId;
    this.messages.push(message);
    return message;
  }
}

module.exports = { ImportBatchBuilder, createImportBatchBuilder };
