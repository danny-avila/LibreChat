const crypto = require('crypto');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { loadSummarizationChain } = require('langchain/chains');
const { getConvo, getMessages, saveMessage, updateMessage, saveConvo } = require('../../../models');

class BaseClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.sender = options.sender || 'AI';
    this.contextStrategy = null;
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

  async buildMessages() {
    throw new Error('Subclasses must implement buildMessages');
  }

  getBuildMessagesOptions() {
    throw new Error('Subclasses must implement getBuildMessagesOptions');
  }

  addInstructions(messages, instructions) {
    const payload = [];
    if (!instructions) {
      return messages;
    }
    if (messages.length > 1) {
      payload.push(...messages.slice(0, -1));
    }

    payload.push(instructions);

    if (messages.length > 0) {
      payload.push(messages[messages.length - 1]);
    }

    return payload;
  }

  async handleTokenCountMap(tokenCountMap) {
    if (this.options.debug) {
      console.debug('Token count map', tokenCountMap);
    }

    if (this.currentMessages.length === 0) {
      return;
    }

    for (let i = 0; i < this.currentMessages.length; i++) {
      // Skip the last message, which is the user message.
      if (i === this.currentMessages.length - 1) {
        break;
      }

      const message = this.currentMessages[i];
      if (message.tokenCount) {
        if (this.options.debug) {
          console.debug(`Skipping ${message.messageId}: already had a token count.`);
        }
        continue;
      }

      const tokenCount = tokenCountMap[message.messageId];
      if (tokenCount) {
        message.tokenCount = tokenCount;
        await this.updateMessageInDatabase({ messageId: message.messageId, tokenCount });
      }
    }
  }

  concatenateMessages(messages) {
    return messages.reduce((acc, message) => {
      const nameOrRole = message.name ?? message.role;
      return acc + `${nameOrRole}:\n${message.content}\n\n`;
    }, '');
  }

  async refineMessages(messagesToRefine, remainingContext) {
    const model = new ChatOpenAI({ temperature: 0 });
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 0,
    });

    const chain = loadSummarizationChain(model, { type: 'refine' });
    const concatenatedMessages = this.concatenateMessages(messagesToRefine);
    const input_documents = await splitter.createDocuments([concatenatedMessages]);
    if (this.options.debug ) {
      console.debug(`Refining message: ${concatenatedMessages.slice(0, 25)}...`);
    }
    try {
      const res = await chain.call({
        input_documents,
      });
  
      const refinedMessage = {
        role: 'user',
        content: res.output,
        tokenCount: this.getTokenCountForMessage(res.text),
      }
  
      if (this.options.debug ) {
        console.debug('Refined messages', refinedMessage);
        console.debug(`remainingContext: ${remainingContext}, after refining: ${remainingContext - refinedMessage.tokenCount}`);
      }

      return refinedMessage;
    } catch (e) {
      console.error('Error refining messages');
      console.error(e);
      return null;
    }
  }

  /**
 * This method processes an array of messages and returns a context of messages that fit within a token limit.
 * It iterates over the messages from newest to oldest, adding them to the context until the token limit is reached.
 * If the token limit would be exceeded by adding a message, that message and possibly the previous one are added to a separate array of messages to refine.
 * The method uses `push` and `pop` operations for efficient array manipulation, and reverses the arrays at the end to maintain the original order of the messages.
 * The method also includes a mechanism to avoid blocking the event loop by waiting for the next tick after each iteration.
 *
 * @param {Array} messages - An array of messages, each with a `tokenCount` property. The messages should be ordered from oldest to newest.
 * @returns {Object} An object with three properties: `context`, `remainingContext`, and `messagesToRefine`. `context` is an array of messages that fit within the token limit. `remainingContext` is the number of tokens remaining within the limit after adding the messages to the context. `messagesToRefine` is an array of messages that were not added to the context because they would have exceeded the token limit.
 */
  async getMessagesWithinTokenLimit(messages) {
    let currentTokenCount = 0;
    let context = [];
    let messagesToRefine = [];
    let remainingContext = this.maxContextTokens;
  
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const newTokenCount = currentTokenCount + message.tokenCount;
      const exceededLimit = newTokenCount > this.maxContextTokens;
      let shouldRefine = exceededLimit && this.shouldRefineContext;
      let refineNextMessage = i !== 0 && i !== 1 && context.length > 0;
  
      if (shouldRefine) {
        messagesToRefine.push(message);
  
        if (refineNextMessage) {
          const removedMessage = context.pop();
          messagesToRefine.push(removedMessage);
          currentTokenCount -= removedMessage.tokenCount;
          remainingContext = this.maxContextTokens - currentTokenCount;
          refineNextMessage = false;
        }
  
        continue;
      } else if (exceededLimit) {
        break;
      }
  
      context.push(message);
      currentTokenCount = newTokenCount;
      remainingContext = this.maxContextTokens - currentTokenCount;
      await new Promise(resolve => setImmediate(resolve));
    }
  
    return { context: context.reverse(), remainingContext, messagesToRefine: messagesToRefine.reverse() };
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
    this.currentMessages = await this.loadHistory(conversationId, parentMessageId) ?? [];
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
      console.debug('currentMessages', this.currentMessages);
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

    this.currentMessages.push(userMessage);
    let { prompt: payload, tokenCountMap } = await this.buildMessages(
      this.currentMessages,
      userMessage.messageId,
      this.getBuildMessagesOptions(opts),
    );

    if (this.options.debug) {
      console.debug('payload');
      console.debug(payload);
    }

    if (tokenCountMap) {
      payload = payload.map((message, i) => {
        const { tokenCount, ...messageWithoutTokenCount } = message;
        // userMessage is always the last one in the payload
        if (i === payload.length - 1) {
          userMessage.tokenCount = message.tokenCount;
          console.debug(`Token count for user message: ${tokenCount}`, `Instruction Tokens: ${tokenCountMap.instructions || 'N/A'}`);
        }
        return messageWithoutTokenCount;
      });
      this.handleTokenCountMap(tokenCountMap);
    }

    await this.saveMessageToDatabase(userMessage, saveOptions, user);
    responseMessage.text = await this.sendCompletion(payload, opts);
    if (tokenCountMap && this.getTokenCountForResponse) {
      responseMessage.tokenCount = this.getTokenCountForResponse(responseMessage);
    }
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

  async updateMessageInDatabase(message) {
    await updateMessage(message);
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

  /**
 * Algorithm adapted from "6. Counting tokens for chat API calls" of
 * https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
 *
 * An additional 2 tokens need to be added for metadata after all messages have been counted.
 *
 * @param {*} message
 */
  getTokenCountForMessage(message) {
    let tokensPerMessage;
    let nameAdjustment;
    if (this.modelOptions.model.startsWith('gpt-4')) {
      tokensPerMessage = 3;
      nameAdjustment = 1;
    } else {
      tokensPerMessage = 4;
      nameAdjustment = -1;
    }

    if (this.options.debug) {
      console.debug('getTokenCountForMessage', message);
    }

    // Map each property of the message to the number of tokens it contains
    const propertyTokenCounts = Object.entries(message).map(([key, value]) => {
      if (key === 'tokenCount' || typeof value !== 'string') {
        return 0;
      }
      // Count the number of tokens in the property value
      const numTokens = this.getTokenCount(value);

      // Adjust by `nameAdjustment` tokens if the property key is 'name'
      const adjustment = (key === 'name') ? nameAdjustment : 0;
      return numTokens + adjustment;
    });

    if (this.options.debug) {
      console.debug('propertyTokenCounts', propertyTokenCounts);
    }

    // Sum the number of tokens in all properties and add `tokensPerMessage` for metadata
    return propertyTokenCounts.reduce((a, b) => a + b, tokensPerMessage);
  }
}

module.exports = BaseClient;