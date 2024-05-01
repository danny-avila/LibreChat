const { v4: uuidv4 } = require('uuid');
const { Constants, EModelEndpoint } = require('librechat-data-provider');
const { bulkSaveConvos } = require('~/models/Conversation');
const { bulkSaveMessages } = require('~/models/Message');
const { logger } = require('~/config');

const defaultModel = 'gpt-3.5-turbo';

// Factory function for creating ConversationBuilder instances
/**
 * Creates an instance of ImportBatchBuilder.
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
   * @returns {Promise<void>} A promise that resolves when the conversation is started.
   */
  async startConversation(endpoint) {
    // we are simplifying by using a single model for the entire conversation

    this.endpoint = endpoint || EModelEndpoint.openAI;
    this.conversationId = uuidv4();
    this.lastMessageId = Constants.NO_PARENT;
  }

  /**
   * Adds a user message to the current conversation.
   * @param {string} text - The text of the user message.
   * @returns {Promise<object>} A promise that resolves with the saved message object.
   */
  async addUserMessage(text) {
    const message = await this.saveMessage({ text, sender: 'user', isCreatedByUser: true });
    return message;
  }

  /**
   * Adds a GPT message to the current conversation.
   * @param {string} text - The text of the GPT message.
   * @param {string} [model='defaultModel'] - The model used for generating the GPT message. Defaults to 'defaultModel'.
   * @param {string} [sender='GPT-3.5'] - The sender of the GPT message. Defaults to 'GPT-3.5'.
   * @returns {Promise<object>} A promise that resolves with the saved message object.
   */
  async addGptMessage(text, model, sender = 'GPT-3.5') {
    const message = await this.saveMessage({
      text,
      sender,
      isCreatedByUser: false,
      model: model || defaultModel,
    });
    return message;
  }

  /**
   * Finishes the current conversation and adds it to the batch.
   * @param {string} [title='Imported Chat'] - The title of the conversation. Defaults to 'Imported Chat'.
   * @param {Date} [createdAt] - The creation date of the conversation.
   * @returns {Promise<object>} A promise that resolves with the added conversation object.
   */
  async finishConversation(title, createdAt) {
    const convo = {
      user: this.requestUserId,
      conversationId: this.conversationId,
      title: title || 'Imported Chat',
      createdAt: createdAt,
      updatedAt: createdAt,
      overrideTimestamp: true,
      endpoint: this.endpoint,
      model: defaultModel,
    };
    this.conversations.push(convo);
    logger.debug(`Conversation added to the batch: ${convo.conversationId}`);

    return convo;
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
   * @param {boolean} messageDetails.isCreatedByUser - Indicates whether the message is created by the user.
   * @param {string} [messageDetails.model] - The model used for generating the message.
   * @param {string} [messageDetails.parentMessageId=this.lastMessageId] - The ID of the parent message.
   * @returns {object} The saved message object.
   */
  saveMessage({ text, sender, isCreatedByUser, model, parentMessageId = this.lastMessageId }) {
    const newMessageId = uuidv4();
    const message = {
      messageId: newMessageId,
      parentMessageId: parentMessageId,
      conversationId: this.conversationId,
      isCreatedByUser: isCreatedByUser,
      user: this.requestUserId,
      endpoint: this.endpoint,
      model: model || this.model,
      unfinished: false,
      isEdited: false,
      error: false,
      sender,
      text,
    };
    this.lastMessageId = newMessageId;
    this.messages.push(message);
    return message;
  }
}

module.exports = { ImportBatchBuilder, createImportBatchBuilder };
