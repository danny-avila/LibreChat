const crypto = require('crypto');
const BaseClient = require('./BaseClient');
const { maxTokensMap } = require('../../../utils');

class FakeClient extends BaseClient {
  constructor(apiKey, options = {}) {
    super(apiKey, options);
    this.sender = 'AI Assistant';
    this.setOptions(options);
  }
  setOptions(options) {
    if (this.options && !this.options.replaceOptions) {
      this.options.modelOptions = {
        ...this.options.modelOptions,
        ...options.modelOptions,
      };
      delete options.modelOptions;
      this.options = {
        ...this.options,
        ...options,
      };
    } else {
      this.options = options;
    }

    if (this.options.openaiApiKey) {
      this.apiKey = this.options.openaiApiKey;
    }

    const modelOptions = this.options.modelOptions || {};
    if (!this.modelOptions) {
      this.modelOptions = {
        ...modelOptions,
        model: modelOptions.model || 'gpt-3.5-turbo',
        temperature: typeof modelOptions.temperature === 'undefined' ? 0.8 : modelOptions.temperature,
        top_p: typeof modelOptions.top_p === 'undefined' ? 1 : modelOptions.top_p,
        presence_penalty: typeof modelOptions.presence_penalty === 'undefined' ? 1 : modelOptions.presence_penalty,
        stop: modelOptions.stop,
      };
    }

    this.maxContextTokens = maxTokensMap[this.modelOptions.model] ?? 4097;
  }
  getCompletion() {}
  buildMessages() {}
  getTokenCount(str) {
    return str.length;
  }
  getTokenCountForMessage(message) {
    return message?.content?.length || message.length;
  }
}

const initializeFakeClient = (apiKey, options, fakeMessages) => {
  let TestClient = new FakeClient(apiKey);
  TestClient.options = options;
  TestClient.abortController = { abort: jest.fn() };
  TestClient.saveMessageToDatabase = jest.fn();
  TestClient.loadHistory = jest
    .fn()
    .mockImplementation((conversationId, parentMessageId = null) => {
      if (!conversationId) {
        TestClient.currentMessages = [];
        return Promise.resolve([]);
      }

      const orderedMessages = TestClient.constructor.getMessagesForConversation(
        fakeMessages,
        parentMessageId
      );

      TestClient.currentMessages = orderedMessages;
      return Promise.resolve(orderedMessages);
    });

  TestClient.getSaveOptions = jest.fn().mockImplementation(() => {
    return {};
  });

  TestClient.getBuildMessagesOptions = jest.fn().mockImplementation(() => {
    return {};
  });

  TestClient.sendCompletion = jest.fn(async () => {
    return 'Mock response text';
  });

  TestClient.sendMessage = jest.fn().mockImplementation(async (message, opts = {}) => {
    if (opts && typeof opts === 'object') {
      TestClient.setOptions(opts);
    }

    const user = opts.user || null;
    const conversationId = opts.conversationId || crypto.randomUUID();
    const parentMessageId = opts.parentMessageId || '00000000-0000-0000-0000-000000000000';
    const userMessageId = opts.overrideParentMessageId || crypto.randomUUID();
    const saveOptions = TestClient.getSaveOptions();

    this.pastMessages = await TestClient.loadHistory(
      conversationId,
      TestClient.options?.parentMessageId
    );

    const userMessage = {
      text: message,
      sender: TestClient.sender,
      isCreatedByUser: true,
      messageId: userMessageId,
      parentMessageId,
      conversationId
    };

    const response = {
      sender: TestClient.sender,
      text: 'Hello, User!',
      isCreatedByUser: false,
      messageId: crypto.randomUUID(),
      parentMessageId: userMessage.messageId,
      conversationId
    };

    fakeMessages.push(userMessage);
    fakeMessages.push(response);

    if (typeof opts.getIds === 'function') {
      opts.getIds({
        userMessage,
        conversationId,
        responseMessageId: response.messageId
      });
    }

    if (typeof opts.onStart === 'function') {
      opts.onStart(userMessage);
    }

    let { prompt: payload, tokenCountMap } = await TestClient.buildMessages(
      this.currentMessages,
      userMessage.messageId,
      TestClient.getBuildMessagesOptions(opts),
    );

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
      TestClient.handleTokenCountMap(tokenCountMap);
    }

    await TestClient.saveMessageToDatabase(userMessage, saveOptions, user);
    response.text = await TestClient.sendCompletion(payload, opts);
    if (tokenCountMap && TestClient.getTokenCountForResponse) {
      response.tokenCount = TestClient.getTokenCountForResponse(response);
    }
    await TestClient.saveMessageToDatabase(response, saveOptions, user);
    return response;
  });

  TestClient.buildMessages = jest.fn(async (messages, parentMessageId) => {
    const orderedMessages = TestClient.constructor.getMessagesForConversation(messages, parentMessageId);
    const formattedMessages = orderedMessages.map((message) => {
      let { role: _role, sender, text } = message;
      const role = _role ?? sender;
      const content = text ?? '';
      return {
        role: role?.toLowerCase() === 'user' ? 'user' : 'assistant',
        content,
      };
    });
    return {
      prompt: formattedMessages,
      tokenCountMap: null, // Simplified for the mock
    };
  });

  return TestClient;
}

module.exports = { FakeClient, initializeFakeClient };