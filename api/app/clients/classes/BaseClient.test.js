const BaseClient = require('./BaseClient');
const crypto = require('crypto');

jest.mock('../../../lib/db/connectDb');
jest.mock('../../../models', () => {
  return function () {
    return {
      save: jest.fn(),
      deleteConvos: jest.fn(),
      getConvo: jest.fn(),
      getMessages: jest.fn(),
      saveMessage: jest.fn(),
      updateMessage: jest.fn(),
      saveConvo: jest.fn()
    };
  };
});

jest.mock('langchain/text_splitter', () => {
  return {
    RecursiveCharacterTextSplitter: jest.fn().mockImplementation(() => {
      return { createDocuments: jest.fn().mockResolvedValue([]) };
    }),
  };
});

jest.mock('langchain/chat_models/openai', () => {
  return {
    ChatOpenAI: jest.fn().mockImplementation(() => {
      return {};
    }),
  };
});

jest.mock('langchain/chains', () => {
  return {
    loadSummarizationChain: jest.fn().mockReturnValue({
      call: jest.fn().mockResolvedValue({ output_text: 'Refined answer' }),
    }),
  };
});

let parentMessageId;
let conversationId;
const fakeMessages = [];
const userMessage = 'Hello, ChatGPT!';
const apiKey = 'fake-api-key';

describe('BaseClient', () => {
  let TestClient;
  const options = {
    modelOptions: {
      model: 'gpt-3.5-turbo',
      temperature: 0,
    }
  };
  class FakeClient extends BaseClient {
    constructor(apiKey, options = {}) {
      super(apiKey, options);
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
    }
    getCompletion() {}
    getSaveOptions() {}
    buildMessages() {}
    getBuildMessagesOptions() {}
    getTokenCount(str) {
      return str.length;
    }
    getTokenCountForMessage(message) {
      return message?.content?.length || message.length;
    }
  }

  beforeEach(() => {
    TestClient = new FakeClient(apiKey);
    TestClient.options = options;
    TestClient.abortController = { abort: jest.fn() };
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
    TestClient.sendMessage = jest.fn().mockImplementation(async (message, opts = {}) => {
      if (opts && typeof opts === 'object') {
        TestClient.setOptions(opts);
      }
      const conversationId = opts.conversationId || crypto.randomUUID();
      const parentMessageId = opts.parentMessageId || '00000000-0000-0000-0000-000000000000';
      const userMessageId = opts.overrideParentMessageId || crypto.randomUUID();
      this.pastMessages = await TestClient.loadHistory(
        conversationId,
        TestClient.options?.parentMessageId
      );

      const userMessage = {
        text: message,
        sender: 'ChatGPT',
        isCreatedByUser: true,
        messageId: userMessageId,
        parentMessageId,
        conversationId
      };

      const response = {
        sender: 'ChatGPT',
        text: 'Hello, User!',
        isCreatedByUser: false,
        messageId: crypto.randomUUID(),
        parentMessageId: userMessage.messageId,
        conversationId
      };

      fakeMessages.push(userMessage);
      fakeMessages.push(response);
      return response;
    });
  });

  test('returns the input messages without instructions when addInstructions() is called with empty instructions', () => {
    const messages = [
      { content: 'Hello' },
      { content: 'How are you?' },
      { content: 'Goodbye' },
    ];
    const instructions = '';
    const result = TestClient.addInstructions(messages, instructions);
    expect(result).toEqual(messages);
  });

  test('returns the input messages with instructions properly added when addInstructions() is called with non-empty instructions', () => {
    const messages = [
      { content: 'Hello' },
      { content: 'How are you?' },
      { content: 'Goodbye' },
    ];
    const instructions = { content: 'Please respond to the question.' };
    const result = TestClient.addInstructions(messages, instructions);
    const expected = [
      { content: 'Hello' },
      { content: 'How are you?' },
      { content: 'Please respond to the question.' },
      { content: 'Goodbye' },
    ];
    expect(result).toEqual(expected);
  });

  test('concats messages correctly in concatenateMessages()', () => {
    const messages = [
      { name: 'User', content: 'Hello' },
      { name: 'Assistant', content: 'How can I help you?' },
      { name: 'User', content: 'I have a question.' },
    ];
    const result = TestClient.concatenateMessages(messages);
    const expected = `User:\nHello\n\nAssistant:\nHow can I help you?\n\nUser:\nI have a question.\n\n`;
    expect(result).toBe(expected);
  });

  test('refines messages correctly in refineMessages()', async () => {
    const messagesToRefine = [
      { role: 'user', content: 'Hello', tokenCount: 10 },
      { role: 'assistant', content: 'How can I help you?', tokenCount: 20 }
    ];
    const remainingContextTokens = 100;
    const expectedRefinedMessage = {
      role: 'assistant',
      content: 'Refined answer',
      tokenCount: 14 // 'Refined answer'.length
    };

    const result = await TestClient.refineMessages(messagesToRefine, remainingContextTokens);
    expect(result).toEqual(expectedRefinedMessage);
  });

  test('gets messages within token limit (under limit) correctly in getMessagesWithinTokenLimit()', async () => {
    TestClient.maxContextTokens = 100;
    TestClient.shouldRefineContext = true;
    TestClient.refineMessages = jest.fn().mockResolvedValue({
      role: 'assistant',
      content: 'Refined answer',
      tokenCount: 30
    });

    const messages = [
      { role: 'user', content: 'Hello', tokenCount: 5 },
      { role: 'assistant', content: 'How can I help you?', tokenCount: 19 },
      { role: 'user', content: 'I have a question.', tokenCount: 18 },
    ];
    const expectedContext = [
      { role: 'user', content: 'Hello', tokenCount: 5 }, // 'Hello'.length
      { role: 'assistant', content: 'How can I help you?', tokenCount: 19 },
      { role: 'user', content: 'I have a question.', tokenCount: 18 },
    ];
    const expectedRemainingContextTokens = 58; // 100 - 5 - 19 - 18
    const expectedMessagesToRefine = [];

    const result = await TestClient.getMessagesWithinTokenLimit(messages);
    expect(result.context).toEqual(expectedContext);
    expect(result.remainingContextTokens).toBe(expectedRemainingContextTokens);
    expect(result.messagesToRefine).toEqual(expectedMessagesToRefine);
  });

  test('gets messages within token limit (over limit) correctly in getMessagesWithinTokenLimit()', async () => {
    TestClient.maxContextTokens = 50; // Set a lower limit
    TestClient.shouldRefineContext = true;
    TestClient.refineMessages = jest.fn().mockResolvedValue({
      role: 'assistant',
      content: 'Refined answer',
      tokenCount: 4
    });

    const messages = [
      { role: 'user', content: 'I need a coffee, stat!', tokenCount: 30 },
      { role: 'assistant', content: 'Sure, I can help with that.', tokenCount: 30 },
      { role: 'user', content: 'Hello', tokenCount: 5 },
      { role: 'assistant', content: 'How can I help you?', tokenCount: 19 },
      { role: 'user', content: 'I have a question.', tokenCount: 18 },
    ];
    const expectedContext = [
      { role: 'user', content: 'Hello', tokenCount: 5 },
      { role: 'assistant', content: 'How can I help you?', tokenCount: 19 },
      { role: 'user', content: 'I have a question.', tokenCount: 18 },
    ];
    const expectedRemainingContextTokens = 8; // 50 - 18 - 19 - 5
    const expectedMessagesToRefine = [
      { role: 'user', content: 'I need a coffee, stat!', tokenCount: 30 },
      { role: 'assistant', content: 'Sure, I can help with that.', tokenCount: 30 },
    ];

    const result = await TestClient.getMessagesWithinTokenLimit(messages);
    expect(result.context).toEqual(expectedContext);
    expect(result.remainingContextTokens).toBe(expectedRemainingContextTokens);
    expect(result.messagesToRefine).toEqual(expectedMessagesToRefine);
  });

  test('handles context strategy correctly in handleContextStrategy()', async () => {
    TestClient.addInstructions = jest.fn().mockReturnValue([
      { content: 'Hello' },
      { content: 'How can I help you?' },
      { content: 'Please provide more details.' },
      { content: 'I can assist you with that.' }
    ]);
    TestClient.getMessagesWithinTokenLimit = jest.fn().mockReturnValue({
      context: [
        { content: 'How can I help you?' },
        { content: 'Please provide more details.' },
        { content: 'I can assist you with that.' }
      ],
      remainingContextTokens: 80,
      messagesToRefine: [
        { content: 'Hello' },
      ],
      refineIndex: 3,
    });
    TestClient.refineMessages = jest.fn().mockResolvedValue({
      role: 'assistant',
      content: 'Refined answer',
      tokenCount: 30
    });
    TestClient.getTokenCountForResponse = jest.fn().mockReturnValue(40);

    const inputInstructions = { content: 'Please provide more details.' };
    const orderedMessages = [
      { content: 'Hello' },
      { content: 'How can I help you?' },
      { content: 'Please provide more details.' },
      { content: 'I can assist you with that.' }
    ];
    const formattedMessages = [
      { content: 'Hello' },
      { content: 'How can I help you?' },
      { content: 'Please provide more details.' },
      { content: 'I can assist you with that.' }
    ];
    const expectedResult = {
      payload: [
        {
          content: 'Refined answer',
          role: 'assistant',
          tokenCount: 30
        },
        { content: 'How can I help you?' },
        { content: 'Please provide more details.' },
        { content: 'I can assist you with that.' }
      ],
      tokenCountMap: {},
    };

    const result = await TestClient.handleContextStrategy({
      instructions: inputInstructions,
      orderedMessages,
      formattedMessages,
    });
    expect(result).toEqual(expectedResult);
  });

  describe('sendMessage', () => {
    test('sendMessage should return a response message', async () => {
      const expectedResult = expect.objectContaining({
        sender: expect.any(String),
        text: expect.any(String),
        isCreatedByUser: false,
        messageId: expect.any(String),
        parentMessageId: expect.any(String),
        conversationId: expect.any(String)
      });

      const response = await TestClient.sendMessage(userMessage);
      parentMessageId = response.messageId;
      conversationId = response.conversationId;
      expect(response).toEqual(expectedResult);
    });

    test('sendMessage should work with provided conversationId and parentMessageId', async () => {
      const userMessage = 'Second message in the conversation';
      const opts = {
        conversationId,
        parentMessageId
      };

      const expectedResult = expect.objectContaining({
        sender: expect.any(String),
        text: expect.any(String),
        isCreatedByUser: false,
        messageId: expect.any(String),
        parentMessageId: expect.any(String),
        conversationId: opts.conversationId
      });

      const response = await TestClient.sendMessage(userMessage, opts);
      parentMessageId = response.messageId;
      expect(response.conversationId).toEqual(conversationId);
      expect(response).toEqual(expectedResult);
    });

    test('should return chat history', async () => {
      const chatMessages = await TestClient.loadHistory(conversationId, parentMessageId);
      expect(TestClient.currentMessages).toHaveLength(4);
      expect(chatMessages[0].text).toEqual(userMessage);
    });
  });
});
