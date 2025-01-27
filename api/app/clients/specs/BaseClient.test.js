const { Constants } = require('librechat-data-provider');
const { initializeFakeClient } = require('./FakeClient');

jest.mock('~/lib/db/connectDb');
jest.mock('~/models', () => ({
  User: jest.fn(),
  Key: jest.fn(),
  Session: jest.fn(),
  Balance: jest.fn(),
  Transaction: jest.fn(),
  getMessages: jest.fn().mockResolvedValue([]),
  saveMessage: jest.fn(),
  updateMessage: jest.fn(),
  deleteMessagesSince: jest.fn(),
  deleteMessages: jest.fn(),
  getConvoTitle: jest.fn(),
  getConvo: jest.fn(),
  saveConvo: jest.fn(),
  deleteConvos: jest.fn(),
  getPreset: jest.fn(),
  getPresets: jest.fn(),
  savePreset: jest.fn(),
  deletePresets: jest.fn(),
  findFileById: jest.fn(),
  createFile: jest.fn(),
  updateFile: jest.fn(),
  deleteFile: jest.fn(),
  deleteFiles: jest.fn(),
  getFiles: jest.fn(),
  updateFileUsage: jest.fn(),
}));

jest.mock('@langchain/openai', () => {
  return {
    ChatOpenAI: jest.fn().mockImplementation(() => {
      return {};
    }),
  };
});

let parentMessageId;
let conversationId;
const fakeMessages = [];
const userMessage = 'Hello, ChatGPT!';
const apiKey = 'fake-api-key';

const messageHistory = [
  { role: 'user', isCreatedByUser: true, text: 'Hello', messageId: '1' },
  { role: 'assistant', isCreatedByUser: false, text: 'Hi', messageId: '2', parentMessageId: '1' },
  {
    role: 'user',
    isCreatedByUser: true,
    text: 'What\'s up',
    messageId: '3',
    parentMessageId: '2',
  },
];

describe('BaseClient', () => {
  let TestClient;
  const options = {
    // debug: true,
    modelOptions: {
      model: 'gpt-4o-mini',
      temperature: 0,
    },
  };

  beforeEach(() => {
    TestClient = initializeFakeClient(apiKey, options, fakeMessages);
    TestClient.summarizeMessages = jest.fn().mockResolvedValue({
      summaryMessage: {
        role: 'system',
        content: 'Refined answer',
      },
      summaryTokenCount: 5,
    });
  });

  test('returns the input messages without instructions when addInstructions() is called with empty instructions', () => {
    const messages = [{ content: 'Hello' }, { content: 'How are you?' }, { content: 'Goodbye' }];
    const instructions = '';
    const result = TestClient.addInstructions(messages, instructions);
    expect(result).toEqual(messages);
  });

  test('returns the input messages with instructions properly added when addInstructions() is called with non-empty instructions', () => {
    const messages = [{ content: 'Hello' }, { content: 'How are you?' }, { content: 'Goodbye' }];
    const instructions = { content: 'Please respond to the question.' };
    const result = TestClient.addInstructions(messages, instructions);
    const expected = [
      { content: 'Please respond to the question.' },
      { content: 'Hello' },
      { content: 'How are you?' },
      { content: 'Goodbye' },
    ];
    expect(result).toEqual(expected);
  });

  test('returns the input messages with instructions properly added when addInstructions() with legacy flag', () => {
    const messages = [{ content: 'Hello' }, { content: 'How are you?' }, { content: 'Goodbye' }];
    const instructions = { content: 'Please respond to the question.' };
    const result = TestClient.addInstructions(messages, instructions, true);
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
    const expected =
      'User:\nHello\n\nAssistant:\nHow can I help you?\n\nUser:\nI have a question.\n\n';
    expect(result).toBe(expected);
  });

  test('refines messages correctly in summarizeMessages()', async () => {
    const messagesToRefine = [
      { role: 'user', content: 'Hello', tokenCount: 10 },
      { role: 'assistant', content: 'How can I help you?', tokenCount: 20 },
    ];
    const remainingContextTokens = 100;
    const expectedRefinedMessage = {
      role: 'system',
      content: 'Refined answer',
    };

    const result = await TestClient.summarizeMessages({ messagesToRefine, remainingContextTokens });
    expect(result.summaryMessage).toEqual(expectedRefinedMessage);
  });

  test('gets messages within token limit (under limit) correctly in getMessagesWithinTokenLimit()', async () => {
    TestClient.maxContextTokens = 100;
    TestClient.shouldSummarize = true;

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
    // Subtract 3 tokens for Assistant Label priming after all messages have been counted.
    const expectedRemainingContextTokens = 58 - 3; // (100 - 5 - 19 - 18) - 3
    const expectedMessagesToRefine = [];

    const lastExpectedMessage =
      expectedMessagesToRefine?.[expectedMessagesToRefine.length - 1] ?? {};
    const expectedIndex = messages.findIndex((msg) => msg.content === lastExpectedMessage?.content);

    const result = await TestClient.getMessagesWithinTokenLimit({ messages });

    expect(result.context).toEqual(expectedContext);
    expect(result.summaryIndex).toEqual(expectedIndex);
    expect(result.remainingContextTokens).toBe(expectedRemainingContextTokens);
    expect(result.messagesToRefine).toEqual(expectedMessagesToRefine);
  });

  test('gets result over token limit correctly in getMessagesWithinTokenLimit()', async () => {
    TestClient.maxContextTokens = 50; // Set a lower limit
    TestClient.shouldSummarize = true;

    const messages = [
      { role: 'user', content: 'Hello', tokenCount: 30 },
      { role: 'assistant', content: 'How can I help you?', tokenCount: 30 },
      { role: 'user', content: 'I have a question.', tokenCount: 5 },
      { role: 'user', content: 'I need a coffee, stat!', tokenCount: 19 },
      { role: 'assistant', content: 'Sure, I can help with that.', tokenCount: 18 },
    ];

    // Subtract 3 tokens for Assistant Label priming after all messages have been counted.
    const expectedRemainingContextTokens = 5; // (50 - 18 - 19 - 5) - 3
    const expectedMessagesToRefine = [
      { role: 'user', content: 'Hello', tokenCount: 30 },
      { role: 'assistant', content: 'How can I help you?', tokenCount: 30 },
    ];
    const expectedContext = [
      { role: 'user', content: 'I have a question.', tokenCount: 5 },
      { role: 'user', content: 'I need a coffee, stat!', tokenCount: 19 },
      { role: 'assistant', content: 'Sure, I can help with that.', tokenCount: 18 },
    ];

    const lastExpectedMessage =
      expectedMessagesToRefine?.[expectedMessagesToRefine.length - 1] ?? {};
    const expectedIndex = messages.findIndex((msg) => msg.content === lastExpectedMessage?.content);

    const result = await TestClient.getMessagesWithinTokenLimit({ messages });

    expect(result.context).toEqual(expectedContext);
    expect(result.summaryIndex).toEqual(expectedIndex);
    expect(result.remainingContextTokens).toBe(expectedRemainingContextTokens);
    expect(result.messagesToRefine).toEqual(expectedMessagesToRefine);
  });

  test('handles context strategy correctly in handleContextStrategy()', async () => {
    TestClient.addInstructions = jest
      .fn()
      .mockReturnValue([
        { content: 'Hello' },
        { content: 'How can I help you?' },
        { content: 'Please provide more details.' },
        { content: 'I can assist you with that.' },
      ]);
    TestClient.getMessagesWithinTokenLimit = jest.fn().mockReturnValue({
      context: [
        { content: 'How can I help you?' },
        { content: 'Please provide more details.' },
        { content: 'I can assist you with that.' },
      ],
      remainingContextTokens: 80,
      messagesToRefine: [{ content: 'Hello' }],
      summaryIndex: 3,
    });

    TestClient.getTokenCount = jest.fn().mockReturnValue(40);

    const instructions = { content: 'Please provide more details.' };
    const orderedMessages = [
      { content: 'Hello' },
      { content: 'How can I help you?' },
      { content: 'Please provide more details.' },
      { content: 'I can assist you with that.' },
    ];
    const formattedMessages = [
      { content: 'Hello' },
      { content: 'How can I help you?' },
      { content: 'Please provide more details.' },
      { content: 'I can assist you with that.' },
    ];
    const expectedResult = {
      payload: [
        {
          role: 'system',
          content: 'Refined answer',
        },
        { content: 'How can I help you?' },
        { content: 'Please provide more details.' },
        { content: 'I can assist you with that.' },
      ],
      promptTokens: expect.any(Number),
      tokenCountMap: {},
      messages: expect.any(Array),
    };

    TestClient.shouldSummarize = true;
    const result = await TestClient.handleContextStrategy({
      instructions,
      orderedMessages,
      formattedMessages,
    });

    expect(result).toEqual(expectedResult);
  });

  describe('getMessagesForConversation', () => {
    it('should return an empty array if the parentMessageId does not exist', () => {
      const result = TestClient.constructor.getMessagesForConversation({
        messages: unorderedMessages,
        parentMessageId: '999',
      });
      expect(result).toEqual([]);
    });

    it('should handle messages with messageId property', () => {
      const messagesWithMessageId = [
        { messageId: '1', parentMessageId: null, text: 'Message 1' },
        { messageId: '2', parentMessageId: '1', text: 'Message 2' },
      ];
      const result = TestClient.constructor.getMessagesForConversation({
        messages: messagesWithMessageId,
        parentMessageId: '2',
      });
      expect(result).toEqual([
        { messageId: '1', parentMessageId: null, text: 'Message 1' },
        { messageId: '2', parentMessageId: '1', text: 'Message 2' },
      ]);
    });

    const messagesWithNullParent = [
      { id: '1', parentMessageId: null, text: 'Message 1' },
      { id: '2', parentMessageId: null, text: 'Message 2' },
    ];

    it('should handle messages with null parentMessageId that are not root', () => {
      const result = TestClient.constructor.getMessagesForConversation({
        messages: messagesWithNullParent,
        parentMessageId: '2',
      });
      expect(result).toEqual([{ id: '2', parentMessageId: null, text: 'Message 2' }]);
    });

    const cyclicMessages = [
      { id: '3', parentMessageId: '2', text: 'Message 3' },
      { id: '1', parentMessageId: '3', text: 'Message 1' },
      { id: '2', parentMessageId: '1', text: 'Message 2' },
    ];

    it('should handle cyclic references without going into an infinite loop', () => {
      const result = TestClient.constructor.getMessagesForConversation({
        messages: cyclicMessages,
        parentMessageId: '3',
      });
      expect(result).toEqual([
        { id: '1', parentMessageId: '3', text: 'Message 1' },
        { id: '2', parentMessageId: '1', text: 'Message 2' },
        { id: '3', parentMessageId: '2', text: 'Message 3' },
      ]);
    });

    const unorderedMessages = [
      { id: '3', parentMessageId: '2', text: 'Message 3' },
      { id: '2', parentMessageId: '1', text: 'Message 2' },
      { id: '1', parentMessageId: Constants.NO_PARENT, text: 'Message 1' },
    ];

    it('should return ordered messages based on parentMessageId', () => {
      const result = TestClient.constructor.getMessagesForConversation({
        messages: unorderedMessages,
        parentMessageId: '3',
      });
      expect(result).toEqual([
        { id: '1', parentMessageId: Constants.NO_PARENT, text: 'Message 1' },
        { id: '2', parentMessageId: '1', text: 'Message 2' },
        { id: '3', parentMessageId: '2', text: 'Message 3' },
      ]);
    });

    const unorderedBranchedMessages = [
      { id: '4', parentMessageId: '2', text: 'Message 4', summary: 'Summary for Message 4' },
      { id: '10', parentMessageId: '7', text: 'Message 10' },
      { id: '1', parentMessageId: null, text: 'Message 1' },
      { id: '6', parentMessageId: '5', text: 'Message 7' },
      { id: '7', parentMessageId: '5', text: 'Message 7' },
      { id: '2', parentMessageId: '1', text: 'Message 2' },
      { id: '8', parentMessageId: '6', text: 'Message 8' },
      { id: '5', parentMessageId: '3', text: 'Message 5' },
      { id: '3', parentMessageId: '1', text: 'Message 3' },
      { id: '6', parentMessageId: '4', text: 'Message 6' },
      { id: '8', parentMessageId: '7', text: 'Message 9' },
      { id: '9', parentMessageId: '7', text: 'Message 9' },
      { id: '11', parentMessageId: '2', text: 'Message 11', summary: 'Summary for Message 11' },
    ];

    it('should return ordered messages from a branched array based on parentMessageId', () => {
      const result = TestClient.constructor.getMessagesForConversation({
        messages: unorderedBranchedMessages,
        parentMessageId: '10',
        summary: true,
      });
      expect(result).toEqual([
        { id: '1', parentMessageId: null, text: 'Message 1' },
        { id: '3', parentMessageId: '1', text: 'Message 3' },
        { id: '5', parentMessageId: '3', text: 'Message 5' },
        { id: '7', parentMessageId: '5', text: 'Message 7' },
        { id: '10', parentMessageId: '7', text: 'Message 10' },
      ]);
    });

    it('should return an empty array if no messages are provided', () => {
      const result = TestClient.constructor.getMessagesForConversation({
        messages: [],
        parentMessageId: '3',
      });
      expect(result).toEqual([]);
    });

    it('should map over the ordered messages if mapMethod is provided', () => {
      const mapMethod = (msg) => msg.text;
      const result = TestClient.constructor.getMessagesForConversation({
        messages: unorderedMessages,
        parentMessageId: '3',
        mapMethod,
      });
      expect(result).toEqual(['Message 1', 'Message 2', 'Message 3']);
    });

    let unorderedMessagesWithSummary = [
      { id: '4', parentMessageId: '3', text: 'Message 4' },
      { id: '2', parentMessageId: '1', text: 'Message 2', summary: 'Summary for Message 2' },
      { id: '3', parentMessageId: '2', text: 'Message 3', summary: 'Summary for Message 3' },
      { id: '1', parentMessageId: null, text: 'Message 1' },
    ];

    it('should start with the message that has a summary property and continue until the specified parentMessageId', () => {
      const result = TestClient.constructor.getMessagesForConversation({
        messages: unorderedMessagesWithSummary,
        parentMessageId: '4',
        summary: true,
      });
      expect(result).toEqual([
        {
          id: '3',
          parentMessageId: '2',
          role: 'system',
          text: 'Summary for Message 3',
          summary: 'Summary for Message 3',
        },
        { id: '4', parentMessageId: '3', text: 'Message 4' },
      ]);
    });

    it('should handle multiple summaries and return the branch from the latest to the parentMessageId', () => {
      unorderedMessagesWithSummary = [
        { id: '5', parentMessageId: '4', text: 'Message 5' },
        { id: '2', parentMessageId: '1', text: 'Message 2', summary: 'Summary for Message 2' },
        { id: '3', parentMessageId: '2', text: 'Message 3', summary: 'Summary for Message 3' },
        { id: '4', parentMessageId: '3', text: 'Message 4', summary: 'Summary for Message 4' },
        { id: '1', parentMessageId: null, text: 'Message 1' },
      ];
      const result = TestClient.constructor.getMessagesForConversation({
        messages: unorderedMessagesWithSummary,
        parentMessageId: '5',
        summary: true,
      });
      expect(result).toEqual([
        {
          id: '4',
          parentMessageId: '3',
          role: 'system',
          text: 'Summary for Message 4',
          summary: 'Summary for Message 4',
        },
        { id: '5', parentMessageId: '4', text: 'Message 5' },
      ]);
    });

    it('should handle summary at root edge case and continue until the parentMessageId', () => {
      unorderedMessagesWithSummary = [
        { id: '5', parentMessageId: '4', text: 'Message 5' },
        { id: '1', parentMessageId: null, text: 'Message 1', summary: 'Summary for Message 1' },
        { id: '4', parentMessageId: '3', text: 'Message 4', summary: 'Summary for Message 4' },
        { id: '2', parentMessageId: '1', text: 'Message 2', summary: 'Summary for Message 2' },
        { id: '3', parentMessageId: '2', text: 'Message 3', summary: 'Summary for Message 3' },
      ];
      const result = TestClient.constructor.getMessagesForConversation({
        messages: unorderedMessagesWithSummary,
        parentMessageId: '5',
        summary: true,
      });
      expect(result).toEqual([
        {
          id: '4',
          parentMessageId: '3',
          role: 'system',
          text: 'Summary for Message 4',
          summary: 'Summary for Message 4',
        },
        { id: '5', parentMessageId: '4', text: 'Message 5' },
      ]);
    });
  });

  describe('sendMessage', () => {
    test('sendMessage should return a response message', async () => {
      const expectedResult = expect.objectContaining({
        sender: TestClient.sender,
        text: expect.any(String),
        isCreatedByUser: false,
        messageId: expect.any(String),
        parentMessageId: expect.any(String),
        conversationId: expect.any(String),
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
        getReqData: jest.fn(),
        onStart: jest.fn(),
      };

      const expectedResult = expect.objectContaining({
        sender: TestClient.sender,
        text: expect.any(String),
        isCreatedByUser: false,
        messageId: expect.any(String),
        parentMessageId: expect.any(String),
        conversationId: opts.conversationId,
      });

      const response = await TestClient.sendMessage(userMessage, opts);
      parentMessageId = response.messageId;
      expect(response.conversationId).toEqual(conversationId);
      expect(response).toEqual(expectedResult);
      expect(opts.getReqData).toHaveBeenCalled();
      expect(opts.onStart).toHaveBeenCalled();
      expect(TestClient.getBuildMessagesOptions).toHaveBeenCalled();
      expect(TestClient.getSaveOptions).toHaveBeenCalled();
    });

    test('should return chat history', async () => {
      TestClient = initializeFakeClient(apiKey, options, messageHistory);
      const chatMessages = await TestClient.loadHistory(conversationId, '2');
      expect(TestClient.currentMessages).toHaveLength(2);
      expect(chatMessages[0].text).toEqual('Hello');

      const chatMessages2 = await TestClient.loadHistory(conversationId, '3');
      expect(TestClient.currentMessages).toHaveLength(3);
      expect(chatMessages2[chatMessages2.length - 1].text).toEqual('What\'s up');
    });

    /* Most of the new sendMessage logic revolving around edited/continued AI messages
     *  can be summarized by the following test. The condition will load the entire history up to
     *  the message that is being edited, which will trigger the AI API to 'continue' the response.
     *  The 'userMessage' is only passed by convention and is not necessary for the generation.
     */
    it('should not push userMessage to currentMessages when isEdited is true and vice versa', async () => {
      const overrideParentMessageId = 'user-message-id';
      const responseMessageId = 'response-message-id';
      const newHistory = messageHistory.slice();
      newHistory.push({
        role: 'assistant',
        isCreatedByUser: false,
        text: 'test message',
        messageId: responseMessageId,
        parentMessageId: '3',
      });

      TestClient = initializeFakeClient(apiKey, options, newHistory);
      const sendMessageOptions = {
        isEdited: true,
        overrideParentMessageId,
        parentMessageId: '3',
        responseMessageId,
      };

      await TestClient.sendMessage('test message', sendMessageOptions);
      const currentMessages = TestClient.currentMessages;
      expect(currentMessages[currentMessages.length - 1].messageId).not.toEqual(
        overrideParentMessageId,
      );

      // Test the opposite case
      sendMessageOptions.isEdited = false;
      await TestClient.sendMessage('test message', sendMessageOptions);
      const currentMessages2 = TestClient.currentMessages;
      expect(currentMessages2[currentMessages2.length - 1].messageId).toEqual(
        overrideParentMessageId,
      );
    });

    test('setOptions is called with the correct arguments only when replaceOptions is set to true', async () => {
      TestClient.setOptions = jest.fn();
      const opts = { conversationId: '123', parentMessageId: '456', replaceOptions: true };
      await TestClient.sendMessage('Hello, world!', opts);
      expect(TestClient.setOptions).toHaveBeenCalledWith(opts);
      TestClient.setOptions.mockClear();
    });

    test('loadHistory is called with the correct arguments', async () => {
      const opts = { conversationId: '123', parentMessageId: '456' };
      await TestClient.sendMessage('Hello, world!', opts);
      expect(TestClient.loadHistory).toHaveBeenCalledWith(
        opts.conversationId,
        opts.parentMessageId,
      );
    });

    test('getReqData is called with the correct arguments', async () => {
      const getReqData = jest.fn();
      const opts = { getReqData };
      const response = await TestClient.sendMessage('Hello, world!', opts);
      expect(getReqData).toHaveBeenCalledWith(
        expect.objectContaining({
          userMessage: expect.objectContaining({ text: 'Hello, world!' }),
          conversationId: response.conversationId,
          responseMessageId: response.messageId,
        }),
      );
    });

    test('onStart is called with the correct arguments', async () => {
      const onStart = jest.fn();
      const opts = { onStart };
      await TestClient.sendMessage('Hello, world!', opts);

      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Hello, world!' }),
        expect.any(String),
      );
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
          conversationId: expect.any(String),
        }),
        saveOptions,
        user,
      );
    });

    test('sendCompletion is called with the correct arguments', async () => {
      const payload = {}; // Mock payload
      TestClient.buildMessages.mockReturnValue({ prompt: payload, tokenCountMap: null });
      const opts = {};
      await TestClient.sendMessage('Hello, world!', opts);
      expect(TestClient.sendCompletion).toHaveBeenCalledWith(payload, opts);
    });

    test('getTokenCount for response is called with the correct arguments', async () => {
      const tokenCountMap = {}; // Mock tokenCountMap
      TestClient.buildMessages.mockReturnValue({ prompt: [], tokenCountMap });
      TestClient.getTokenCountForResponse = jest.fn();
      const response = await TestClient.sendMessage('Hello, world!', {});
      expect(TestClient.getTokenCountForResponse).toHaveBeenCalledWith(response);
    });

    test('returns an object with the correct shape', async () => {
      const response = await TestClient.sendMessage('Hello, world!', {});
      expect(response).toEqual(
        expect.objectContaining({
          sender: expect.any(String),
          text: expect.any(String),
          isCreatedByUser: expect.any(Boolean),
          messageId: expect.any(String),
          parentMessageId: expect.any(String),
          conversationId: expect.any(String),
        }),
      );
    });

    test('userMessagePromise is awaited before saving response message', async () => {
      // Mock the saveMessageToDatabase method
      TestClient.saveMessageToDatabase = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => setTimeout(resolve, 100)); // Simulate a delay
      });

      // Send a message
      const messagePromise = TestClient.sendMessage('Hello, world!');

      // Wait a short time to ensure the user message save has started
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Check that saveMessageToDatabase has been called once (for the user message)
      expect(TestClient.saveMessageToDatabase).toHaveBeenCalledTimes(1);

      // Wait for the message to be fully processed
      await messagePromise;

      // Check that saveMessageToDatabase has been called twice (once for user message, once for response)
      expect(TestClient.saveMessageToDatabase).toHaveBeenCalledTimes(2);

      // Check the order of calls
      const calls = TestClient.saveMessageToDatabase.mock.calls;
      expect(calls[0][0].isCreatedByUser).toBe(true); // First call should be for user message
      expect(calls[1][0].isCreatedByUser).toBe(false); // Second call should be for response message
    });
  });

  // Add these tests within the BaseClient describe block

  describe('getMessagesWithinTokenLimit with instructions', () => {
    test('should always include instructions when present', async () => {
      TestClient.maxContextTokens = 50;
      const instructions = {
        role: 'system',
        content: 'System instructions',
        tokenCount: 20,
      };

      const messages = [
        instructions,
        { role: 'user', content: 'Hello', tokenCount: 10 },
        { role: 'assistant', content: 'Hi there', tokenCount: 15 },
      ];

      const result = await TestClient.getMessagesWithinTokenLimit({
        messages,
        instructions,
      });

      expect(result.context[0]).toBe(instructions);
      expect(result.remainingContextTokens).toBe(2);
    });

    test('should handle case when messages exceed limit but instructions must be preserved', async () => {
      TestClient.maxContextTokens = 30;
      const instructions = {
        role: 'system',
        content: 'System instructions',
        tokenCount: 20,
      };

      const messages = [
        instructions,
        { role: 'user', content: 'Hello', tokenCount: 10 },
        { role: 'assistant', content: 'Hi there', tokenCount: 15 },
      ];

      const result = await TestClient.getMessagesWithinTokenLimit({
        messages,
        instructions,
      });

      // Should only include instructions and the last message that fits
      expect(result.context).toHaveLength(1);
      expect(result.context[0].content).toBe(instructions.content);
      expect(result.messagesToRefine).toHaveLength(2);
      expect(result.remainingContextTokens).toBe(7); // 30 - 20 - 3 (assistant label)
    });

    test('should work correctly without instructions', async () => {
      TestClient.maxContextTokens = 50;
      const messages = [
        { role: 'user', content: 'Hello', tokenCount: 10 },
        { role: 'assistant', content: 'Hi there', tokenCount: 15 },
      ];

      const result = await TestClient.getMessagesWithinTokenLimit({
        messages,
      });

      expect(result.context).toHaveLength(2);
      expect(result.remainingContextTokens).toBe(22); // 50 - 10 - 15 - 3(assistant label)
      expect(result.messagesToRefine).toHaveLength(0);
    });

    test('should handle case when only instructions fit within limit', async () => {
      TestClient.maxContextTokens = 25;
      const instructions = {
        role: 'system',
        content: 'System instructions',
        tokenCount: 20,
      };

      const messages = [
        instructions,
        { role: 'user', content: 'Hello', tokenCount: 10 },
        { role: 'assistant', content: 'Hi there', tokenCount: 15 },
      ];

      const result = await TestClient.getMessagesWithinTokenLimit({
        messages,
        instructions,
      });

      expect(result.context).toHaveLength(1);
      expect(result.context[0]).toBe(instructions);
      expect(result.messagesToRefine).toHaveLength(2);
      expect(result.remainingContextTokens).toBe(2); // 25 - 20 - 3(assistant label)
    });
  });
});
