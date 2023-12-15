require('dotenv').config();
const { fetchEventSource } = require('@waylaidwanderer/fetch-event-source');
const { genAzureChatCompletion } = require('~/utils/azureUtils');
const OpenAIClient = require('../OpenAIClient');
jest.mock('meilisearch');

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

jest.mock('langchain/chat_models/openai', () => {
  return {
    ChatOpenAI: jest.fn().mockImplementation(() => {
      return {};
    }),
  };
});

describe('OpenAIClient', () => {
  let client, client2;
  const model = 'gpt-4';
  const parentMessageId = '1';
  const messages = [
    { role: 'user', sender: 'User', text: 'Hello', messageId: parentMessageId },
    { role: 'assistant', sender: 'Assistant', text: 'Hi', messageId: '2' },
  ];

  const defaultOptions = {
    // debug: true,
    openaiApiKey: 'new-api-key',
    modelOptions: {
      model,
      temperature: 0.7,
    },
  };

  const defaultAzureOptions = {
    azureOpenAIApiInstanceName: 'your-instance-name',
    azureOpenAIApiDeploymentName: 'your-deployment-name',
    azureOpenAIApiVersion: '2020-07-01-preview',
  };

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    console.warn.mockRestore();
  });

  beforeEach(() => {
    const options = { ...defaultOptions };
    client = new OpenAIClient('test-api-key', options);
    client2 = new OpenAIClient('test-api-key', options);
    client.summarizeMessages = jest.fn().mockResolvedValue({
      role: 'assistant',
      content: 'Refined answer',
      tokenCount: 30,
    });
    client.buildPrompt = jest
      .fn()
      .mockResolvedValue({ prompt: messages.map((m) => m.text).join('\n') });
    client.constructor.freeAndResetAllEncoders();
    client.getMessages = jest.fn().mockResolvedValue([]);
  });

  describe('setOptions', () => {
    it('should set the options correctly', () => {
      expect(client.apiKey).toBe('new-api-key');
      expect(client.modelOptions.model).toBe(model);
      expect(client.modelOptions.temperature).toBe(0.7);
    });

    it('should set apiKey and useOpenRouter if OPENROUTER_API_KEY is present', () => {
      process.env.OPENROUTER_API_KEY = 'openrouter-key';
      client.setOptions({});
      expect(client.apiKey).toBe('openrouter-key');
      expect(client.useOpenRouter).toBe(true);
      delete process.env.OPENROUTER_API_KEY; // Cleanup
    });

    it('should set FORCE_PROMPT based on OPENAI_FORCE_PROMPT or reverseProxyUrl', () => {
      process.env.OPENAI_FORCE_PROMPT = 'true';
      client.setOptions({});
      expect(client.FORCE_PROMPT).toBe(true);
      delete process.env.OPENAI_FORCE_PROMPT; // Cleanup
      client.FORCE_PROMPT = undefined;

      client.setOptions({ reverseProxyUrl: 'https://example.com/completions' });
      expect(client.FORCE_PROMPT).toBe(true);
      client.FORCE_PROMPT = undefined;

      client.setOptions({ reverseProxyUrl: 'https://example.com/chat' });
      expect(client.FORCE_PROMPT).toBe(false);
    });

    it('should set isChatCompletion based on useOpenRouter, reverseProxyUrl, or model', () => {
      client.setOptions({ reverseProxyUrl: null });
      // true by default since default model will be gpt-3.5-turbo
      expect(client.isChatCompletion).toBe(true);
      client.isChatCompletion = undefined;

      // false because completions url will force prompt payload
      client.setOptions({ reverseProxyUrl: 'https://example.com/completions' });
      expect(client.isChatCompletion).toBe(false);
      client.isChatCompletion = undefined;

      client.setOptions({ modelOptions: { model: 'gpt-3.5-turbo' }, reverseProxyUrl: null });
      expect(client.isChatCompletion).toBe(true);
    });

    it('should set completionsUrl and langchainProxy based on reverseProxyUrl', () => {
      client.setOptions({ reverseProxyUrl: 'https://localhost:8080/v1/chat/completions' });
      expect(client.completionsUrl).toBe('https://localhost:8080/v1/chat/completions');
      expect(client.langchainProxy).toBe('https://localhost:8080/v1');

      client.setOptions({ reverseProxyUrl: 'https://example.com/completions' });
      expect(client.completionsUrl).toBe('https://example.com/completions');
      expect(client.langchainProxy).toBe('https://example.com/completions');
    });
  });

  describe('setOptions with Simplified Azure Integration', () => {
    afterEach(() => {
      delete process.env.AZURE_OPENAI_DEFAULT_MODEL;
      delete process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME;
    });

    const azureOpenAIApiInstanceName = 'test-instance';
    const azureOpenAIApiDeploymentName = 'test-deployment';
    const azureOpenAIApiVersion = '2020-07-01-preview';

    const createOptions = (model) => ({
      modelOptions: { model },
      azure: {
        azureOpenAIApiInstanceName,
        azureOpenAIApiDeploymentName,
        azureOpenAIApiVersion,
      },
    });

    it('should set model from AZURE_OPENAI_DEFAULT_MODEL when Azure is enabled', () => {
      process.env.AZURE_OPENAI_DEFAULT_MODEL = 'gpt-4-azure';
      const options = createOptions('test');
      client.azure = options.azure;
      client.setOptions(options);
      expect(client.modelOptions.model).toBe('gpt-4-azure');
    });

    it('should not change model if Azure is not enabled', () => {
      process.env.AZURE_OPENAI_DEFAULT_MODEL = 'gpt-4-azure';
      const originalModel = 'test';
      client.azure = false;
      client.setOptions(createOptions('test'));
      expect(client.modelOptions.model).toBe(originalModel);
    });

    it('should not change model if AZURE_OPENAI_DEFAULT_MODEL is not set and model is passed', () => {
      const originalModel = 'GROK-LLM';
      const options = createOptions(originalModel);
      client.azure = options.azure;
      client.setOptions(options);
      expect(client.modelOptions.model).toBe(originalModel);
    });

    it('should change model if AZURE_OPENAI_DEFAULT_MODEL is set and model is passed', () => {
      process.env.AZURE_OPENAI_DEFAULT_MODEL = 'gpt-4-azure';
      const originalModel = 'GROK-LLM';
      const options = createOptions(originalModel);
      client.azure = options.azure;
      client.setOptions(options);
      expect(client.modelOptions.model).toBe(process.env.AZURE_OPENAI_DEFAULT_MODEL);
    });

    it('should include model in deployment name if AZURE_USE_MODEL_AS_DEPLOYMENT_NAME is set', () => {
      process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'true';
      const model = 'gpt-4-azure';

      const AzureClient = new OpenAIClient('test-api-key', createOptions(model));

      const expectedValue = `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${model}/chat/completions?api-version=${azureOpenAIApiVersion}`;

      expect(AzureClient.modelOptions.model).toBe(model);
      expect(AzureClient.azureEndpoint).toBe(expectedValue);
    });

    it('should include model in deployment name if AZURE_USE_MODEL_AS_DEPLOYMENT_NAME and default model is set', () => {
      const defaultModel = 'gpt-4-azure';
      process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'true';
      process.env.AZURE_OPENAI_DEFAULT_MODEL = defaultModel;
      const model = 'gpt-4-this-is-a-test-model-name';

      const AzureClient = new OpenAIClient('test-api-key', createOptions(model));

      const expectedValue = `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${model}/chat/completions?api-version=${azureOpenAIApiVersion}`;

      expect(AzureClient.modelOptions.model).toBe(defaultModel);
      expect(AzureClient.azureEndpoint).toBe(expectedValue);
    });

    it('should not include model in deployment name if AZURE_USE_MODEL_AS_DEPLOYMENT_NAME is not set', () => {
      const model = 'gpt-4-azure';

      const AzureClient = new OpenAIClient('test-api-key', createOptions(model));

      const expectedValue = `https://${azureOpenAIApiInstanceName}.openai.azure.com/openai/deployments/${azureOpenAIApiDeploymentName}/chat/completions?api-version=${azureOpenAIApiVersion}`;

      expect(AzureClient.modelOptions.model).toBe(model);
      expect(AzureClient.azureEndpoint).toBe(expectedValue);
    });
  });

  describe('selectTokenizer', () => {
    it('should get the correct tokenizer based on the instance state', () => {
      const tokenizer = client.selectTokenizer();
      expect(tokenizer).toBeDefined();
    });
  });

  describe('freeAllTokenizers', () => {
    it('should free all tokenizers', () => {
      // Create a tokenizer
      const tokenizer = client.selectTokenizer();

      // Mock 'free' method on the tokenizer
      tokenizer.free = jest.fn();

      client.constructor.freeAndResetAllEncoders();

      // Check if 'free' method has been called on the tokenizer
      expect(tokenizer.free).toHaveBeenCalled();
    });
  });

  describe('getTokenCount', () => {
    it('should return the correct token count', () => {
      const count = client.getTokenCount('Hello, world!');
      expect(count).toBeGreaterThan(0);
    });

    it('should reset the encoder and count when count reaches 25', () => {
      const freeAndResetEncoderSpy = jest.spyOn(client.constructor, 'freeAndResetAllEncoders');

      // Call getTokenCount 25 times
      for (let i = 0; i < 25; i++) {
        client.getTokenCount('test text');
      }

      expect(freeAndResetEncoderSpy).toHaveBeenCalled();
    });

    it('should not reset the encoder and count when count is less than 25', () => {
      const freeAndResetEncoderSpy = jest.spyOn(client.constructor, 'freeAndResetAllEncoders');
      freeAndResetEncoderSpy.mockClear();

      // Call getTokenCount 24 times
      for (let i = 0; i < 24; i++) {
        client.getTokenCount('test text');
      }

      expect(freeAndResetEncoderSpy).not.toHaveBeenCalled();
    });

    it('should handle errors and reset the encoder', () => {
      const freeAndResetEncoderSpy = jest.spyOn(client.constructor, 'freeAndResetAllEncoders');

      // Mock encode function to throw an error
      client.selectTokenizer().encode = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      client.getTokenCount('test text');

      expect(freeAndResetEncoderSpy).toHaveBeenCalled();
    });

    it('should not throw null pointer error when freeing the same encoder twice', () => {
      client.constructor.freeAndResetAllEncoders();
      client2.constructor.freeAndResetAllEncoders();

      const count = client2.getTokenCount('test text');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('getSaveOptions', () => {
    it('should return the correct save options', () => {
      const options = client.getSaveOptions();
      expect(options).toHaveProperty('chatGptLabel');
      expect(options).toHaveProperty('promptPrefix');
    });
  });

  describe('getBuildMessagesOptions', () => {
    it('should return the correct build messages options', () => {
      const options = client.getBuildMessagesOptions({ promptPrefix: 'Hello' });
      expect(options).toHaveProperty('isChatCompletion');
      expect(options).toHaveProperty('promptPrefix');
      expect(options.promptPrefix).toBe('Hello');
    });
  });

  describe('buildMessages', () => {
    it('should build messages correctly for chat completion', async () => {
      const result = await client.buildMessages(messages, parentMessageId, {
        isChatCompletion: true,
      });
      expect(result).toHaveProperty('prompt');
    });

    it('should build messages correctly for non-chat completion', async () => {
      const result = await client.buildMessages(messages, parentMessageId, {
        isChatCompletion: false,
      });
      expect(result).toHaveProperty('prompt');
    });

    it('should build messages correctly with a promptPrefix', async () => {
      const result = await client.buildMessages(messages, parentMessageId, {
        isChatCompletion: true,
        promptPrefix: 'Test Prefix',
      });
      expect(result).toHaveProperty('prompt');
      const instructions = result.prompt.find((item) => item.name === 'instructions');
      expect(instructions).toBeDefined();
      expect(instructions.content).toContain('Test Prefix');
    });

    it('should handle context strategy correctly', async () => {
      client.contextStrategy = 'summarize';
      const result = await client.buildMessages(messages, parentMessageId, {
        isChatCompletion: true,
      });
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('tokenCountMap');
    });

    it('should assign name property for user messages when options.name is set', async () => {
      client.options.name = 'Test User';
      const result = await client.buildMessages(messages, parentMessageId, {
        isChatCompletion: true,
      });
      const hasUserWithName = result.prompt.some(
        (item) => item.role === 'user' && item.name === 'Test_User',
      );
      expect(hasUserWithName).toBe(true);
    });

    it('should handle promptPrefix from options when promptPrefix argument is not provided', async () => {
      client.options.promptPrefix = 'Test Prefix from options';
      const result = await client.buildMessages(messages, parentMessageId, {
        isChatCompletion: true,
      });
      const instructions = result.prompt.find((item) => item.name === 'instructions');
      expect(instructions.content).toContain('Test Prefix from options');
    });

    it('should handle case when neither promptPrefix argument nor options.promptPrefix is set', async () => {
      const result = await client.buildMessages(messages, parentMessageId, {
        isChatCompletion: true,
      });
      const instructions = result.prompt.find((item) => item.name === 'instructions');
      expect(instructions).toBeUndefined();
    });

    it('should handle case when getMessagesForConversation returns null or an empty array', async () => {
      const messages = [];
      const result = await client.buildMessages(messages, parentMessageId, {
        isChatCompletion: true,
      });
      expect(result.prompt).toEqual([]);
    });
  });

  describe('getTokenCountForMessage', () => {
    const example_messages = [
      {
        role: 'system',
        content:
          'You are a helpful, pattern-following assistant that translates corporate jargon into plain English.',
      },
      {
        role: 'system',
        name: 'example_user',
        content: 'New synergies will help drive top-line growth.',
      },
      {
        role: 'system',
        name: 'example_assistant',
        content: 'Things working well together will increase revenue.',
      },
      {
        role: 'system',
        name: 'example_user',
        content:
          'Let\'s circle back when we have more bandwidth to touch base on opportunities for increased leverage.',
      },
      {
        role: 'system',
        name: 'example_assistant',
        content: 'Let\'s talk later when we\'re less busy about how to do better.',
      },
      {
        role: 'user',
        content:
          'This late pivot means we don\'t have time to boil the ocean for the client deliverable.',
      },
    ];

    const testCases = [
      { model: 'gpt-3.5-turbo-0301', expected: 127 },
      { model: 'gpt-3.5-turbo-0613', expected: 129 },
      { model: 'gpt-3.5-turbo', expected: 129 },
      { model: 'gpt-4-0314', expected: 129 },
      { model: 'gpt-4-0613', expected: 129 },
      { model: 'gpt-4', expected: 129 },
      { model: 'unknown', expected: 129 },
    ];

    testCases.forEach((testCase) => {
      it(`should return ${testCase.expected} tokens for model ${testCase.model}`, () => {
        client.modelOptions.model = testCase.model;
        client.selectTokenizer();
        // 3 tokens for assistant label
        let totalTokens = 3;
        for (let message of example_messages) {
          totalTokens += client.getTokenCountForMessage(message);
        }
        expect(totalTokens).toBe(testCase.expected);
      });
    });
  });

  describe('sendMessage/getCompletion', () => {
    afterEach(() => {
      delete process.env.AZURE_OPENAI_DEFAULT_MODEL;
      delete process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME;
    });

    it('[Azure OpenAI] should call getCompletion and fetchEventSource with correct args', async () => {
      // Set a default model
      process.env.AZURE_OPENAI_DEFAULT_MODEL = 'gpt4-turbo';

      const onProgress = jest.fn().mockImplementation(() => ({}));
      client.azure = defaultAzureOptions;
      const getCompletion = jest.spyOn(client, 'getCompletion');
      await client.sendMessage('Hi mom!', {
        replaceOptions: true,
        ...defaultOptions,
        onProgress,
        azure: defaultAzureOptions,
      });

      expect(getCompletion).toHaveBeenCalled();
      expect(getCompletion.mock.calls.length).toBe(1);
      expect(getCompletion.mock.calls[0][0][0].role).toBe('user');
      expect(getCompletion.mock.calls[0][0][0].content).toBe('Hi mom!');

      expect(fetchEventSource).toHaveBeenCalled();
      expect(fetchEventSource.mock.calls.length).toBe(1);

      // Check if the first argument (url) is correct
      const expectedURL = genAzureChatCompletion(defaultAzureOptions);
      const firstCallArgs = fetchEventSource.mock.calls[0];

      expect(firstCallArgs[0]).toBe(expectedURL);
      // Should not have model in the deployment name
      expect(firstCallArgs[0]).not.toContain('gpt4-turbo');

      // Should not include the model in request body
      const requestBody = JSON.parse(firstCallArgs[1].body);
      expect(requestBody).not.toHaveProperty('model');
    });
  });
});
