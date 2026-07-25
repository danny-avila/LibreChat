const { v4: uuidv4 } = require('uuid');
const {
  ContentFilterError,
  UninspectableFileError,
  assertModelBoundContent,
  extractConversationImportContent,
  getBlockedOpaqueFileField,
  getContentTraversalFragments,
  inspectContent,
  isContentTraversalLimitError,
  isNestedMessageTraversalProtected,
  resolveCanonicalFileReferences,
} = require('@librechat/api');
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
const { bulkIncrementTagCounts, bulkSaveConvos, bulkSaveMessages, getFiles } = require('~/models');
const { FALLBACK_MODEL_BY_ENDPOINT } = require('./defaults');

/**
 * Factory function for creating an instance of ImportBatchBuilder.
 * @param {string} requestUserId - The ID of the user making the request.
 * @param {object} [interfaceConfig] - Runtime interface config for import retention.
 * @param {object} [filters] - Source-aware content filters for submitted imports.
 * @returns {ImportBatchBuilder} - The newly created ImportBatchBuilder instance.
 */
function createImportBatchBuilder(requestUserId, interfaceConfig, filters) {
  return new ImportBatchBuilder(requestUserId, interfaceConfig, filters);
}

/**
 * Applies the current content policy to a conversation snapshot before it is copied.
 * @param {object} [filters] - Source-aware content filters.
 * @param {object} snapshot - Conversation content that would be persisted.
 * @param {object[]} snapshot.conversations - Conversation metadata records.
 * @param {object[]} snapshot.messages - Message records.
 * @param {object} [resolutionContext] - Owner-aware canonical file resolution dependencies.
 * @param {{ id?: string, tenantId?: string }} [resolutionContext.user] - Snapshot owner.
 * @param {Function} [resolutionContext.getFiles] - Canonical file lookup.
 * @param {object[]} [resolutionContext.liveFiles] - Already hydrated canonical rows.
 * @returns {Promise<void>}
 * @throws {ContentFilterError|UninspectableFileError|import('@librechat/api').ContentTraversalLimitError}
 */
async function assertConversationContentAllowed(
  filters,
  { conversations, messages },
  resolutionContext = {},
) {
  if (filters == null) {
    return;
  }

  const conversationFinding = inspectContent(
    extractConversationImportContent({
      conversations,
      messages: [],
    }),
    { filters },
  );
  if (conversationFinding != null) {
    throw new ContentFilterError(conversationFinding);
  }

  /**
   * Imports mark every external row `isUserSubmitted`, while native
   * copy/fork/share snapshots retain durable whole-row/path provenance.
   * Reuse the final model-bound invariant so copied model prose is not
   * retroactively classified as caller-authored content.
   */
  let storedMessages = messages;
  let resolvedFiles = [];
  if (filters.files?.pii != null) {
    const fileInspection = await resolveCanonicalFileReferences({
      filters,
      input: messages,
      user: resolutionContext.user,
      liveFiles: resolutionContext.liveFiles,
      getFiles: resolutionContext.getFiles ?? (async () => []),
    });
    storedMessages = fileInspection.sanitizedInput;
    resolvedFiles = fileInspection.hydratedFiles;
  }

  for (const message of storedMessages) {
    try {
      assertModelBoundContent({
        filters,
        storedMessages: [message],
        resolvedFiles,
      });
    } catch (error) {
      if (!isContentTraversalLimitError(error)) {
        throw error;
      }

      const explicitPaths = Array.isArray(message.userSubmittedPaths)
        ? message.userSubmittedPaths.filter(
            (path) => typeof path === 'string' && path.startsWith('/'),
          )
        : [];
      if (Array.isArray(message.content)) {
        for (let index = 0; index < message.content.length; index++) {
          if (message.content[index]?.type === 'steer') {
            explicitPaths.push(`/content/${index}`);
          }
        }
      }
      const isWholeMessageSubmitted =
        message.isCreatedByUser === true ||
        message.isUserSubmitted === true ||
        new Set(explicitPaths).size > 256;
      const relevantFragments = getContentTraversalFragments(error).filter(
        (fragment) =>
          isWholeMessageSubmitted ||
          fragment.source === 'tool_argument' ||
          explicitPaths.some(
            (path) => fragment.path === path || fragment.path.startsWith(`${path}/`),
          ),
      );
      const messageFinding = inspectContent(relevantFragments, { filters });
      if (messageFinding != null) {
        throw new ContentFilterError(messageFinding);
      }

      if (isWholeMessageSubmitted) {
        const uninspectableField = getBlockedOpaqueFileField(filters, message);
        if (uninspectableField != null) {
          throw new UninspectableFileError(uninspectableField);
        }
      }

      const traversalFilters =
        isWholeMessageSubmitted || explicitPaths.length > 0
          ? filters
          : { ...filters, messages: undefined };
      if (
        isNestedMessageTraversalProtected({
          filters: traversalFilters,
          roles:
            isWholeMessageSubmitted || explicitPaths.length > 0 ? ['user'] : [message.role, 'tool'],
        })
      ) {
        throw error;
      }
    }
  }
}

/**
 * Class for building a batch of conversations and messages and pushing them to DB for Conversation Import functionality
 */
class ImportBatchBuilder {
  /**
   * Creates an instance of ImportBatchBuilder.
   * @param {string} requestUserId - The ID of the user making the import request.
   * @param {object} [interfaceConfig] - Runtime interface config for import retention.
   * @param {object} [filters] - Source-aware content filters for submitted imports.
   */
  constructor(requestUserId, interfaceConfig, filters) {
    this.requestUserId = requestUserId;
    this.interfaceConfig = interfaceConfig;
    this.filters = filters;
    this.conversations = [];
    this.messages = [];
    this.retentionFields = undefined;
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
    const message = this.saveMessage({
      text,
      sender: 'user',
      isCreatedByUser: true,
      isUserSubmitted: true,
    });
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
      isUserSubmitted: true,
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
    delete convo.subagentThread;
    this.conversations.push(convo);

    return { conversation: convo, messages: this.messages };
  }

  /**
   * Saves the batch of conversations and messages to the DB.
   * Also increments tag counts for any existing tags.
   * @returns {Promise<void>} A promise that resolves when the batch is saved.
   * @throws {Error} If there is an error saving the batch.
   */
  async saveBatch() {
    await assertConversationContentAllowed(
      this.filters,
      {
        conversations: this.conversations,
        messages: this.messages,
      },
      {
        user: { id: this.requestUserId },
        getFiles,
      },
    );

    try {
      const promises = [];
      promises.push(bulkSaveConvos(this.conversations));
      promises.push(bulkSaveMessages(this.messages, true));
      promises.push(
        bulkIncrementTagCounts(
          this.requestUserId,
          this.conversations.flatMap((convo) => convo.tags),
        ),
      );
      await Promise.all(promises);
      logger.debug(
        `user: ${this.requestUserId} | Added ${this.conversations.length} conversations and ${this.messages.length} messages to the DB.`,
      );
    } catch (error) {
      logger.error('Error saving batch', error);
      throw error;
    }
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

module.exports = {
  ImportBatchBuilder,
  createImportBatchBuilder,
  assertConversationContentAllowed,
};
