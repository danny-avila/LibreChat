const { Constants } = require('librechat-data-provider');
const { saveConvo } = require('~/models/Conversation');
const { v4: uuidv4 } = require('uuid');
const { saveMessage } = require('~/models');
const logger = require('~/config/winston');

const defaultModel = 'gpt-3.5-turbo';

// Factory function for creating ConversationBuilder instances
function createConversationBuilder(requestUserId, endpoint = 'openAI') {
  return new ConversationBuilder(requestUserId, endpoint);
}

class ConversationBuilder {
  constructor(requestUserId, endpoint) {
    this.requestUserId = requestUserId;
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
    const saveConvoResp = await saveConvo(this.requestUserId, {
      newConversationId: this.conversationId,
      messages: this.messages,
      user: this.requestUserId,
      title: title || 'Imported Chat',
      createdAt: createdAt,
      updatedAt: createdAt,
      overrideTimestamp: true,
      endpoint: this.endpoint,
      model: defaultModel,
    });
    logger.debug(`Conversation created id: ${saveConvoResp.conversationId}`);
    return saveConvoResp;
  }

  async saveMessage(text, sender, isCreatedByUser) {
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

    const msg = await saveMessage(message);

    return msg;
  }
}

module.exports = { ConversationBuilder, createConversationBuilder };
