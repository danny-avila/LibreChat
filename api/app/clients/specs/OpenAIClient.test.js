require('dotenv').config();
const OpenAIClient = require('../OpenAIClient');

jest.mock('meilisearch');

describe('OpenAIClient', () => {
  let client, client2;
  const model = 'gpt-4';
  const parentMessageId = '1';
  const messages = [
    { role: 'user', sender: 'User', text: 'Hello', messageId: parentMessageId },
    { role: 'assistant', sender: 'Assistant', text: 'Hi', messageId: '2' },
  ];

  beforeEach(() => {
    const options = {
      // debug: true,
      openaiApiKey: 'new-api-key',
      modelOptions: {
        model,
        temperature: 0.7,
      },
    };
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
      expect(client.langchainProxy).toBeUndefined();
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
});
