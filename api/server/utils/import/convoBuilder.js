const { v4: uuidv4 } = require('uuid');
const { Constants } = require('librechat-data-provider');
const { bulkSaveConvos } = require('~/models/Conversation');
const { bulkSaveMessages } = require('~/models/Message');
const { logger } = require('~/config');

const defaultModel = 'gpt-3.5-turbo';

// Factory function for creating ConversationBuilder instances
function createImportBatchBuilder(requestUserId) {
  return new ImportBatchBuilder(requestUserId);
}

class ImportBatchBuilder {
  constructor(requestUserId) {
    this.requestUserId = requestUserId;
    this.conversations = [];
    this.messages = [];
  }

  async startConversation(endpoint) {
    // we are simplifying by using a single model for the entire conversation

    this.endpoint = endpoint || 'openAI';
    this.conversationId = uuidv4();
    this.lastMessageId = Constants.NO_PARENT;
  }

  async addUserMessage(text) {
    const message = await this.saveMessage(text, 'user', true);
    return message;
  }

  async addGptMessage(text, model, sender = 'GPT-3.5') {
    const message = await this.saveMessage(text, sender, false, model || defaultModel);
    return message;
  }

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

  async saveBatch() {
    try {
      await bulkSaveConvos(this.conversations);
      await bulkSaveMessages(this.messages);
    } catch (error) {
      logger.error('Error saving batch', error);
      throw error;
    }
  }

  saveMessage(text, sender, isCreatedByUser) {
    const newMessageId = uuidv4();
    const message = {
      messageId: newMessageId,
      parentMessageId: this.lastMessageId,
      conversationId: this.conversationId,
      isCreatedByUser: isCreatedByUser,
      user: this.requestUserId,
      endpoint: this.endpoint,
      model: this.model,
      text: text,
      unfinished: false,
      error: false,
      isEdited: false,
      sender: sender,
    };
    this.lastMessageId = newMessageId;

    this.messages.push(message);

    return message;
  }
}

module.exports = { ImportBatchBuilder, createImportBatchBuilder };
