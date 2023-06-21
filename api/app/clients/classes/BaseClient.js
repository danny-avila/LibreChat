const crypto = require('crypto');
const { getConvo, getMessages, saveMessage, saveConvo } = require('../../../models');

class BaseClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.sender = options.sender || 'AI';
    this.currentDateString = new Date().toLocaleDateString('en-us', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  setOptions() {
    throw new Error("Method 'setOptions' must be implemented.");
  }

  getCompletion() {
    throw new Error("Method 'getCompletion' must be implemented.");
  }

  getSaveOptions() {
    throw new Error('Subclasses must implement getSaveOptions');
  }

  buildMessages() {
    throw new Error('Subclasses must implement buildMessages');
  }

  getBuildMessagesOptions() {
    throw new Error('Subclasses must implement getBuildMessagesOptions');
  }

  async sendMessage(message, opts = {}) {
    if (opts && typeof opts === 'object') {
      this.setOptions(opts);
    }
    console.log('sendMessage', message, opts);

    const user = opts.user || null;
    const conversationId = opts.conversationId || crypto.randomUUID();
    const parentMessageId = opts.parentMessageId || '00000000-0000-0000-0000-000000000000';
    const userMessageId = opts.overrideParentMessageId || crypto.randomUUID();
    const responseMessageId = crypto.randomUUID();
    const currentMessages = await this.loadHistory(conversationId, parentMessageId) ?? [];
    const saveOptions = this.getSaveOptions();

    const userMessage = {
      messageId: userMessageId,
      parentMessageId,
      conversationId,
      sender: 'User',
      text: message,
      isCreatedByUser: true
    };

    if (this.options.debug) {
      console.debug('currentMessages', currentMessages);
    }

    if (typeof opts?.getIds === 'function') {
      opts.getIds({
        userMessage,
        conversationId,
        responseMessageId
      });
    }

    if (typeof opts?.onStart === 'function') {
      opts.onStart(userMessage);
    }

    await this.saveMessageToDatabase(userMessage, saveOptions, user);

    const responseMessage = {
      messageId: responseMessageId,
      conversationId,
      parentMessageId: userMessage.messageId,
      isCreatedByUser: false,
      model: this.modelOptions.model,
      sender: this.sender
    };

    if (this.options.debug) {
      console.debug('options');
      console.debug(this.options);
    }

    currentMessages.push(userMessage);
    const { prompt: payload } = await this.buildMessages(
      currentMessages,
      userMessage.messageId,
      this.getBuildMessagesOptions(opts),
    );

    if (this.options.debug) {
      console.debug('payload');
      console.debug(payload);
    }

    responseMessage.text = await this.sendCompletion(payload, opts);
    await this.saveMessageToDatabase(responseMessage, saveOptions, user);
    return { ...responseMessage, ...this.result };
  }

  async getConversation(conversationId, user = null) {
    return await getConvo(user, conversationId);
  }

  async loadHistory(conversationId, parentMessageId = null, mapMethod = null) {
    if (this.options.debug) {
      console.debug('Loading history for conversation', conversationId, parentMessageId);
    }

    const messages = (await getMessages({ conversationId })) || [];

    if (messages.length === 0) {
      return [];
    }

    return this.constructor.getMessagesForConversation(messages, parentMessageId, mapMethod);
  }

  async saveMessageToDatabase(message, endpointOptions, user = null) {
    await saveMessage({ ...message, unfinished: false });
    await saveConvo(user, {
      conversationId: message.conversationId,
      endpoint: this.options.endpoint,
      ...endpointOptions
    });
  }

  /**
     * Iterate through messages, building an array based on the parentMessageId.
     * Each message has an id and a parentMessageId. The parentMessageId is the id of the message that this message is a reply to.
     * @param messages
     * @param parentMessageId
     * @returns {*[]} An array containing the messages in the order they should be displayed, starting with the root message.
     */
  static getMessagesForConversation(messages, parentMessageId, mapMethod = null) {
    const orderedMessages = [];
    let currentMessageId = parentMessageId;
    while (currentMessageId) {
      const message = messages.find(msg => {
        const messageId = msg.messageId ?? msg.id;
        return messageId === currentMessageId;
      });
      if (!message) {
        break;
      }
      orderedMessages.unshift(message);
      currentMessageId = message.parentMessageId;
    }

    if (mapMethod) {
      return orderedMessages.map(mapMethod);
    }

    return orderedMessages;
  }
}

module.exports = BaseClient;