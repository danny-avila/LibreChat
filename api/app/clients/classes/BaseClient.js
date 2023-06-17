const { getConvo, getMessages, saveMessage, saveConvo } = require('../../../models');

class BaseClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.options = options;
    this.setOptions(options);
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

  async getConversation(conversationId, userId = null) {
    return await getConvo(userId, conversationId);
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

  async saveMessageToDatabase(message, endpointOptions, userId = null) {
    await saveMessage({ ...message, unfinished: false });
    await saveConvo(userId, {
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
      const message = messages.find(m => m.id === currentMessageId);
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