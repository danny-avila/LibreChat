const crypto = require('crypto');
const { Constants } = require('librechat-data-provider');
const { HumanChatMessage, AIChatMessage } = require('langchain/schema');
const PluginsClient = require('../PluginsClient');

jest.mock('~/lib/db/connectDb');
jest.mock('~/models/Conversation', () => {
  return function () {
    return {
      save: jest.fn(),
      deleteConvos: jest.fn(),
    };
  };
});

const defaultAzureOptions = {
  azureOpenAIApiInstanceName: 'your-instance-name',
  azureOpenAIApiDeploymentName: 'your-deployment-name',
  azureOpenAIApiVersion: '2020-07-01-preview',
};

describe('PluginsClient', () => {
  let TestAgent;
  let options = {
    tools: [],
    modelOptions: {
      model: 'gpt-3.5-turbo',
      temperature: 0,
      max_tokens: 2,
    },
    agentOptions: {
      model: 'gpt-3.5-turbo',
    },
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

        const orderedMessages = TestAgent.constructor.getMessagesForConversation({
          messages: fakeMessages,
          parentMessageId,
        });

        const chatMessages = orderedMessages.map((msg) =>
          msg?.isCreatedByUser || msg?.role?.toLowerCase() === 'user'
            ? new HumanChatMessage(msg.text)
            : new AIChatMessage(msg.text),
        );

        TestAgent.currentMessages = orderedMessages;
        return Promise.resolve(chatMessages);
      });
    TestAgent.sendMessage = jest.fn().mockImplementation(async (message, opts = {}) => {
      if (opts && typeof opts === 'object') {
        TestAgent.setOptions(opts);
      }
      const conversationId = opts.conversationId || crypto.randomUUID();
      const parentMessageId = opts.parentMessageId || Constants.NO_PARENT;
      const userMessageId = opts.overrideParentMessageId || crypto.randomUUID();
      this.pastMessages = await TestAgent.loadHistory(
        conversationId,
        TestAgent.options?.parentMessageId,
      );

      const userMessage = {
        text: message,
        sender: 'ChatGPT',
        isCreatedByUser: true,
        messageId: userMessageId,
        parentMessageId,
        conversationId,
      };

      const response = {
        sender: 'ChatGPT',
        text: 'Hello, User!',
        isCreatedByUser: false,
        messageId: crypto.randomUUID(),
        parentMessageId: userMessage.messageId,
        conversationId,
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
        conversationId: expect.any(String),
      });

      const response = await TestAgent.sendMessage(userMessage);
      parentMessageId = response.messageId;
      conversationId = response.conversationId;
      expect(response).toEqual(expectedResult);
    });

    test('sendMessage should work with provided conversationId and parentMessageId', async () => {
      const userMessage = 'Second message in the conversation';
      const opts = {
        conversationId,
        parentMessageId,
      };

      const expectedResult = expect.objectContaining({
        sender: 'ChatGPT',
        text: expect.any(String),
        isCreatedByUser: false,
        messageId: expect.any(String),
        parentMessageId: expect.any(String),
        conversationId: opts.conversationId,
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

  describe('getFunctionModelName', () => {
    let client;

    beforeEach(() => {
      client = new PluginsClient('dummy_api_key');
    });

    test('should return the input when it includes a dash followed by four digits', () => {
      expect(client.getFunctionModelName('-1234')).toBe('-1234');
      expect(client.getFunctionModelName('gpt-4-5678-preview')).toBe('gpt-4-5678-preview');
    });

    test('should return the input for all function-capable models (`0613` models and above)', () => {
      expect(client.getFunctionModelName('gpt-4-0613')).toBe('gpt-4-0613');
      expect(client.getFunctionModelName('gpt-4-32k-0613')).toBe('gpt-4-32k-0613');
      expect(client.getFunctionModelName('gpt-3.5-turbo-0613')).toBe('gpt-3.5-turbo-0613');
      expect(client.getFunctionModelName('gpt-3.5-turbo-16k-0613')).toBe('gpt-3.5-turbo-16k-0613');
      expect(client.getFunctionModelName('gpt-3.5-turbo-1106')).toBe('gpt-3.5-turbo-1106');
      expect(client.getFunctionModelName('gpt-4-1106-preview')).toBe('gpt-4-1106-preview');
      expect(client.getFunctionModelName('gpt-4-1106')).toBe('gpt-4-1106');
    });

    test('should return the corresponding model if input is non-function capable (`0314` models)', () => {
      expect(client.getFunctionModelName('gpt-4-0314')).toBe('gpt-4');
      expect(client.getFunctionModelName('gpt-4-32k-0314')).toBe('gpt-4');
      expect(client.getFunctionModelName('gpt-3.5-turbo-0314')).toBe('gpt-3.5-turbo');
      expect(client.getFunctionModelName('gpt-3.5-turbo-16k-0314')).toBe('gpt-3.5-turbo');
    });

    test('should return "gpt-3.5-turbo" when the input includes "gpt-3.5-turbo"', () => {
      expect(client.getFunctionModelName('test gpt-3.5-turbo model')).toBe('gpt-3.5-turbo');
    });

    test('should return "gpt-4" when the input includes "gpt-4"', () => {
      expect(client.getFunctionModelName('testing gpt-4')).toBe('gpt-4');
    });

    test('should return "gpt-3.5-turbo" for input that does not meet any specific condition', () => {
      expect(client.getFunctionModelName('random string')).toBe('gpt-3.5-turbo');
      expect(client.getFunctionModelName('')).toBe('gpt-3.5-turbo');
    });
  });
  describe('Azure OpenAI tests specific to Plugins', () => {
    // TODO: add more tests for Azure OpenAI integration with Plugins
    // let client;
    // beforeEach(() => {
    //   client = new PluginsClient('dummy_api_key');
    // });

    test('should not call getFunctionModelName when azure options are set', () => {
      const spy = jest.spyOn(PluginsClient.prototype, 'getFunctionModelName');
      const model = 'gpt-4-turbo';

      // note, without the azure change in PR #1766, `getFunctionModelName` is called twice
      const testClient = new PluginsClient('dummy_api_key', {
        agentOptions: {
          model,
          agent: 'functions',
        },
        azure: defaultAzureOptions,
      });

      expect(spy).not.toHaveBeenCalled();
      expect(testClient.agentOptions.model).toBe(model);

      spy.mockRestore();
    });
  });
});
