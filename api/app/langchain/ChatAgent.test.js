const mongoose = require('mongoose');
const ChatAgent = require('./ChatAgent');
const connectDb = require('../../lib/db/connectDb');
const Conversation = require('../../models/Conversation');

describe('ChatAgent', () => {
  let TestAgent;
  let options = {
    tools: [],
    modelOptions: {
      model: 'gpt-3.5-turbo',
      temperature: 0,
      max_tokens: 2
    },
    agentOptions: {
      model: 'gpt-3.5-turbo',
    }
  };
  let parentMessageId;
  let conversationId;
  const userMessage = 'Hello, ChatGPT!';
  const apiKey = process.env.OPENAI_API_KEY;

  beforeAll(async () => {
    await connectDb();
  });

  beforeEach(() => {
    TestAgent = new ChatAgent(apiKey, options);
  });

  afterAll(async () => {
    // Delete the messages and conversation created by the test
    await Conversation.deleteConvos(null, { conversationId });
    await mongoose.connection.close();
  });

  test('initializes ChatAgent without crashing', () => {
    expect(TestAgent).toBeInstanceOf(ChatAgent);
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
