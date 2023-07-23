const { initializeFakeClient } = require('./FakeClient');

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
    // debug: true,
    modelOptions: {
      model: 'gpt-3.5-turbo',
      temperature: 0,
    }
  };

  beforeEach(() => {
    TestClient = initializeFakeClient(apiKey, options, fakeMessages);
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
    const expected = 'User:\nHello\n\nAssistant:\nHow can I help you?\n\nUser:\nI have a question.\n\n';
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

    const instructions = { content: 'Please provide more details.' };
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
      promptTokens: expect.any(Number),
      tokenCountMap: {},
      messages: expect.any(Array),
    };

    const result = await TestClient.handleContextStrategy({
      instructions,
      orderedMessages,
      formattedMessages,
    });
    expect(result).toEqual(expectedResult);
  });

  describe('sendMessage', () => {
    test('sendMessage should return a response message', async () => {
      const expectedResult = expect.objectContaining({
        sender: TestClient.sender,
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
        parentMessageId,
        getIds: jest.fn(),
        onStart: jest.fn()
      };

      const expectedResult = expect.objectContaining({
        sender: TestClient.sender,
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
      expect(opts.getIds).toHaveBeenCalled();
      expect(opts.onStart).toHaveBeenCalled();
      expect(TestClient.getBuildMessagesOptions).toHaveBeenCalled();
      expect(TestClient.getSaveOptions).toHaveBeenCalled();
    });

    test('should return chat history', async () => {
      const chatMessages = await TestClient.loadHistory(conversationId, parentMessageId);
      expect(TestClient.currentMessages).toHaveLength(4);
      expect(chatMessages[0].text).toEqual(userMessage);
    });

    test('setOptions is called with the correct arguments', async () => {
      TestClient.setOptions = jest.fn();
      const opts = { conversationId: '123', parentMessageId: '456' };
      await TestClient.sendMessage('Hello, world!', opts);
      expect(TestClient.setOptions).toHaveBeenCalledWith(opts);
      TestClient.setOptions.mockClear();
    });

    test('loadHistory is called with the correct arguments', async () => {
      const opts = { conversationId: '123', parentMessageId: '456' };
      await TestClient.sendMessage('Hello, world!', opts);
      expect(TestClient.loadHistory).toHaveBeenCalledWith(opts.conversationId, opts.parentMessageId);
    });

    test('getIds is called with the correct arguments', async () => {
      const getIds = jest.fn();
      const opts = { getIds };
      const response = await TestClient.sendMessage('Hello, world!', opts);
      expect(getIds).toHaveBeenCalledWith({
        userMessage: expect.objectContaining({ text: 'Hello, world!' }),
        conversationId: response.conversationId,
        responseMessageId: response.messageId
      });
    });

    test('onStart is called with the correct arguments', async () => {
      const onStart = jest.fn();
      const opts = { onStart };
      await TestClient.sendMessage('Hello, world!', opts);
      expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello, world!' }));
    });

    test('saveMessageToDatabase is called with the correct arguments', async () => {
      const saveOptions = TestClient.getSaveOptions();
      const user = {}; // Mock user
      const opts = { user };
      await TestClient.sendMessage('Hello, world!', opts);
      expect(TestClient.saveMessageToDatabase).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: expect.any(String),
          text: expect.any(String),
          isCreatedByUser: expect.any(Boolean),
          messageId: expect.any(String),
          parentMessageId: expect.any(String),
          conversationId: expect.any(String)
        }),
        saveOptions,
        user
      );
    });

    test('sendCompletion is called with the correct arguments', async () => {
      const payload = {}; // Mock payload
      TestClient.buildMessages.mockReturnValue({ prompt: payload, tokenCountMap: null });
      const opts = {};
      await TestClient.sendMessage('Hello, world!', opts);
      expect(TestClient.sendCompletion).toHaveBeenCalledWith(payload, opts);
    });

    test('getTokenCountForResponse is called with the correct arguments', async () => {
      const tokenCountMap = {}; // Mock tokenCountMap
      TestClient.buildMessages.mockReturnValue({ prompt: [], tokenCountMap });
      TestClient.getTokenCountForResponse = jest.fn();
      const response = await TestClient.sendMessage('Hello, world!', {});
      expect(TestClient.getTokenCountForResponse).toHaveBeenCalledWith(response);
    });

    test('returns an object with the correct shape', async () => {
      const response = await TestClient.sendMessage('Hello, world!', {});
      expect(response).toEqual(expect.objectContaining({
        sender: expect.any(String),
        text: expect.any(String),
        isCreatedByUser: expect.any(Boolean),
        messageId: expect.any(String),
        parentMessageId: expect.any(String),
        conversationId: expect.any(String)
      }));
    });
  });
});
