const { v4: uuidv4 } = require('uuid');
const { EModelEndpoint, Constants, openAISettings } = require('librechat-data-provider');
const { bulkSaveConvos } = require('~/models/Conversation');
const { bulkSaveMessages } = require('~/models/Message');
const { logger } = require('~/config');

/**
 * Factory function for creating an instance of ImportBatchBuilder.
 * @param {string} requestUserId - The ID of the user making the request.
 * @returns {ImportBatchBuilder} - The newly created ImportBatchBuilder instance.
 */
function createImportBatchBuilder(requestUserId) {
  return new ImportBatchBuilder(requestUserId);
}

/**
 * Class for building a batch of conversations and messages and pushing them to DB for Conversation Import functionality
 */
class ImportBatchBuilder {
  /**
   * Creates an instance of ImportBatchBuilder.
   * @param {string} requestUserId - The ID of the user making the import request.
   */
  constructor(requestUserId) {
    this.requestUserId = requestUserId;
    this.conversations = [];
    this.messages = [];
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
   * @returns {{ conversation: TConversation, messages: TMessage[] }} The resulting conversation and messages.
   */
  finishConversation(title, createdAt, originalConvo = {}) {
    const convo = {
      ...originalConvo,
      user: this.requestUserId,
      conversationId: this.conversationId,
      title: title || 'Imported Chat',
      createdAt: createdAt,
      updatedAt: createdAt,
      overrideTimestamp: true,
      endpoint: this.endpoint,
      model: originalConvo.model ?? openAISettings.model.default,
    };
    convo._id && delete convo._id;
    this.conversations.push(convo);

    return { conversation: convo, messages: this.messages };
  }

  /**
   * Saves the batch of conversations and messages to the DB.
   * @returns {Promise<void>} A promise that resolves when the batch is saved.
   * @throws {Error} If there is an error saving the batch.
   */
  async saveBatch() {
    try {
      await bulkSaveConvos(this.conversations);
      await bulkSaveMessages(this.messages);
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
    };
    message._id && delete message._id;
    this.lastMessageId = newMessageId;
    this.messages.push(message);
    return message;
  }
}

module.exports = { ImportBatchBuilder, createImportBatchBuilder };
