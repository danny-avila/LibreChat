const { Constants } = require('librechat-data-provider');
const { saveConvo } = require('~/models/Conversation');
const { v4: uuidv4 } = require('uuid');
const { saveMessage } = require('~/models');
const logger = require('~/config/winston');

const defaultModel = 'gpt-3-turbo';

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

  async addGptMessage(text, model) {
    const message = await this.saveMessage(text, 'GPT-4', false, model || defaultModel);
    return message;
  }

  async finishConversation(title) {
    const saveConvoResp = await saveConvo(this.requestUserId, {
      newConversationId: this.conversationId,
      messages: this.messages,
      user: this.requestUserId,
      title: title || 'Imported Chat',
      model: this.model,
    });
    logger.debug(`Conversation created id: ${saveConvoResp.conversationId}`);
  }

  async saveMessage(text, sender, isCreatedByUser) {
    logger.debug('Last message id', this.lastMessageId);
    const newMessageId = uuidv4();
    logger.debug('Adding message id: ', newMessageId, ' text: ', text.substring(0, 60));

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

module.exports = { ConversationBuilder };
