const { HumanChatMessage, AIChatMessage } = require('langchain/schema');
const PluginsClient = require('../PluginsClient');
const crypto = require('crypto');

jest.mock('../../../lib/db/connectDb');
jest.mock('../../../models/Conversation', () => {
  return function () {
    return {
      save: jest.fn(),
      deleteConvos: jest.fn()
    };
  };
});

describe('PluginsClient', () => {
  let TestAgent;
  let options = {
    tools: [],
    modelOptions: {
      model: 'gpt-3.5-turbo',
      temperature: 0,
      max_tokens: 2
    },
    agentOptions: {
      model: 'gpt-3.5-turbo'
    }
  };
  let parentMessageId;
  let conversationId;
  const fakeMessages = [];
  const userMessage = 'Hello, ChatGPT!';
  const apiKey = 'fake-api-key';

  beforeEach(() => {
    TestAgent = new PluginsClient(apiKey, options);
    TestAgent.loadHistory = jest
      .fn()
      .mockImplementation((conversationId, parentMessageId = null) => {
        if (!conversationId) {
          TestAgent.currentMessages = [];
          return Promise.resolve([]);
        }

        const orderedMessages = TestAgent.constructor.getMessagesForConversation(
          fakeMessages,
          parentMessageId
        );

        const chatMessages = orderedMessages.map((msg) =>
          msg?.isCreatedByUser || msg?.role?.toLowerCase() === 'user'
            ? new HumanChatMessage(msg.text)
            : new AIChatMessage(msg.text)
        );

        TestAgent.currentMessages = orderedMessages;
        return Promise.resolve(chatMessages);
      });
    TestAgent.sendMessage = jest.fn().mockImplementation(async (message, opts = {}) => {
      if (opts && typeof opts === 'object') {
        TestAgent.setOptions(opts);
      }
      const conversationId = opts.conversationId || crypto.randomUUID();
      const parentMessageId = opts.parentMessageId || '00000000-0000-0000-0000-000000000000';
      const userMessageId = opts.overrideParentMessageId || crypto.randomUUID();
      this.pastMessages = await TestAgent.loadHistory(
        conversationId,
        TestAgent.options?.parentMessageId
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

  test('initializes PluginsClient without crashing', () => {
    expect(TestAgent).toBeInstanceOf(PluginsClient);
  });

  test('check setOptions function', () => {
    expect(TestAgent.agentIsGpt3).toBe(true);
  });

  describe('sendMessage', () => {
    test('sendMessage should return a response message', async () => {
      const expectedResult = expect.objectContaining({
        sender: 'ChatGPT',
        text: expect.any(String),
        isCreatedByUser: false,
        messageId: expect.any(String),
        parentMessageId: expect.any(String),
        conversationId: expect.any(String)
      });

      const response = await TestAgent.sendMessage(userMessage);
      console.log(response);
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
        sender: 'ChatGPT',
        text: expect.any(String),
        isCreatedByUser: false,
        messageId: expect.any(String),
        parentMessageId: expect.any(String),
        conversationId: opts.conversationId
      });

      const response = await TestAgent.sendMessage(userMessage, opts);
      parentMessageId = response.messageId;
      expect(response.conversationId).toEqual(conversationId);
      expect(response).toEqual(expectedResult);
    });

    test('should return chat history', async () => {
      const chatMessages = await TestAgent.loadHistory(conversationId, parentMessageId);
      expect(TestAgent.currentMessages).toHaveLength(4);
      expect(chatMessages[0].text).toEqual(userMessage);
    });
  });
});
