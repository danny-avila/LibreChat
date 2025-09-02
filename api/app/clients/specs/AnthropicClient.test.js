const { SplitStreamHandler } = require('@librechat/agents');
const { anthropicSettings } = require('librechat-data-provider');
const AnthropicClient = require('~/app/clients/AnthropicClient');

const HUMAN_PROMPT = '\n\nHuman:';
const AI_PROMPT = '\n\nAssistant:';

describe('AnthropicClient', () => {
  let client;
  const model = 'claude-2';
  const parentMessageId = '1';
  const messages = [
    { role: 'user', isCreatedByUser: true, text: 'Hello', messageId: parentMessageId },
    { role: 'assistant', isCreatedByUser: false, text: 'Hi', messageId: '2', parentMessageId },
    {
      role: 'user',
      isCreatedByUser: true,
      text: "What's up",
      messageId: '3',
      parentMessageId: '2',
    },
  ];

  beforeEach(() => {
    const options = {
      modelOptions: {
        model,
        temperature: anthropicSettings.temperature.default,
      },
    };
    client = new AnthropicClient('test-api-key');
    client.setOptions(options);
  });

  describe('setOptions', () => {
    it('should set the options correctly', () => {
      expect(client.apiKey).toBe('test-api-key');
      expect(client.modelOptions.model).toBe(model);
      expect(client.modelOptions.temperature).toBe(anthropicSettings.temperature.default);
    });

    it('should set legacy maxOutputTokens for non-Claude-3 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-2',
          maxOutputTokens: anthropicSettings.maxOutputTokens.default,
        },
      });
      expect(client.modelOptions.maxOutputTokens).toBe(
        anthropicSettings.legacy.maxOutputTokens.default,
      );
    });
    it('should not set maxOutputTokens if not provided', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-3',
        },
      });
      expect(client.modelOptions.maxOutputTokens).toBeUndefined();
    });

    it('should not set legacy maxOutputTokens for Claude-3 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-3-opus-20240229',
          maxOutputTokens: anthropicSettings.legacy.maxOutputTokens.default,
        },
      });
      expect(client.modelOptions.maxOutputTokens).toBe(
        anthropicSettings.legacy.maxOutputTokens.default,
      );
    });
  });

  describe('getSaveOptions', () => {
    it('should return the correct save options', () => {
      const options = client.getSaveOptions();
      expect(options).toHaveProperty('modelLabel');
      expect(options).toHaveProperty('promptPrefix');
    });
  });

  describe('buildMessages', () => {
    it('should handle promptPrefix from options when promptPrefix argument is not provided', async () => {
      client.options.promptPrefix = 'Test Prefix from options';
      const result = await client.buildMessages(messages, parentMessageId);
      const { prompt } = result;
      expect(prompt).toContain('Test Prefix from options');
    });

    it('should build messages correctly for chat completion', async () => {
      const result = await client.buildMessages(messages, '2');
      expect(result).toHaveProperty('prompt');
      expect(result.prompt).toContain(HUMAN_PROMPT);
      expect(result.prompt).toContain('Hello');
      expect(result.prompt).toContain(AI_PROMPT);
      expect(result.prompt).toContain('Hi');
    });

    it('should group messages by the same author', async () => {
      const groupedMessages = messages.map((m) => ({ ...m, isCreatedByUser: true, role: 'user' }));
      const result = await client.buildMessages(groupedMessages, '3');
      expect(result.context).toHaveLength(1);

      // Check that HUMAN_PROMPT appears only once in the prompt
      const matches = result.prompt.match(new RegExp(HUMAN_PROMPT, 'g'));
      expect(matches).toHaveLength(1);

      groupedMessages.push({
        role: 'assistant',
        isCreatedByUser: false,
        text: 'I heard you the first time',
        messageId: '4',
        parentMessageId: '3',
      });

      const result2 = await client.buildMessages(groupedMessages, '4');
      expect(result2.context).toHaveLength(2);

      // Check that HUMAN_PROMPT appears only once in the prompt
      const human_matches = result2.prompt.match(new RegExp(HUMAN_PROMPT, 'g'));
      const ai_matches = result2.prompt.match(new RegExp(AI_PROMPT, 'g'));
      expect(human_matches).toHaveLength(1);
      expect(ai_matches).toHaveLength(1);
    });

    it('should handle isEdited condition', async () => {
      const editedMessages = [
        { role: 'user', isCreatedByUser: true, text: 'Hello', messageId: '1' },
        { role: 'assistant', isCreatedByUser: false, text: 'Hi', messageId: '2', parentMessageId },
      ];

      const trimmedLabel = AI_PROMPT.trim();
      const result = await client.buildMessages(editedMessages, '2');
      expect(result.prompt.trim().endsWith(trimmedLabel)).toBeFalsy();

      // Add a human message at the end to test the opposite
      editedMessages.push({
        role: 'user',
        isCreatedByUser: true,
        text: 'Hi again',
        messageId: '3',
        parentMessageId: '2',
      });
      const result2 = await client.buildMessages(editedMessages, '3');
      expect(result2.prompt.trim().endsWith(trimmedLabel)).toBeTruthy();
    });

    it('should build messages correctly with a promptPrefix', async () => {
      const promptPrefix = 'Test Prefix';
      client.options.promptPrefix = promptPrefix;
      const result = await client.buildMessages(messages, parentMessageId);
      const { prompt } = result;
      expect(prompt).toBeDefined();
      expect(prompt).toContain(promptPrefix);
      const textAfterPrefix = prompt.split(promptPrefix)[1];
      expect(textAfterPrefix).toContain(AI_PROMPT);

      const editedMessages = messages.slice(0, -1);
      const result2 = await client.buildMessages(editedMessages, parentMessageId);
      const textAfterPrefix2 = result2.prompt.split(promptPrefix)[1];
      expect(textAfterPrefix2).toContain(AI_PROMPT);
    });

    it('should handle identityPrefix from options', async () => {
      client.options.userLabel = 'John';
      client.options.modelLabel = 'Claude-2';
      const result = await client.buildMessages(messages, parentMessageId);
      const { prompt } = result;
      expect(prompt).toContain("Human's name: John");
      expect(prompt).toContain('You are Claude-2');
    });
  });

  describe('getClient', () => {
    it('should set legacy maxOutputTokens for non-Claude-3 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-2',
          maxOutputTokens: anthropicSettings.legacy.maxOutputTokens.default,
        },
      });
      expect(client.modelOptions.maxOutputTokens).toBe(
        anthropicSettings.legacy.maxOutputTokens.default,
      );
    });

    it('should not set legacy maxOutputTokens for Claude-3 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-3-opus-20240229',
          maxOutputTokens: anthropicSettings.legacy.maxOutputTokens.default,
        },
      });
      expect(client.modelOptions.maxOutputTokens).toBe(
        anthropicSettings.legacy.maxOutputTokens.default,
      );
    });

    it('should add "max-tokens" & "prompt-caching" beta header for claude-3-5-sonnet model', () => {
      const client = new AnthropicClient('test-api-key');
      const modelOptions = {
        model: 'claude-3-5-sonnet-20241022',
      };
      client.setOptions({ modelOptions, promptCache: true });
      const anthropicClient = client.getClient(modelOptions);
      expect(anthropicClient._options.defaultHeaders).toBeDefined();
      expect(anthropicClient._options.defaultHeaders).toHaveProperty('anthropic-beta');
      expect(anthropicClient._options.defaultHeaders['anthropic-beta']).toBe(
        'max-tokens-3-5-sonnet-2024-07-15,prompt-caching-2024-07-31',
      );
    });

    it('should add "prompt-caching" beta header for claude-3-haiku model', () => {
      const client = new AnthropicClient('test-api-key');
      const modelOptions = {
        model: 'claude-3-haiku-2028',
      };
      client.setOptions({ modelOptions, promptCache: true });
      const anthropicClient = client.getClient(modelOptions);
      expect(anthropicClient._options.defaultHeaders).toBeDefined();
      expect(anthropicClient._options.defaultHeaders).toHaveProperty('anthropic-beta');
      expect(anthropicClient._options.defaultHeaders['anthropic-beta']).toBe(
        'prompt-caching-2024-07-31',
      );
    });

    it('should add "prompt-caching" beta header for claude-3-opus model', () => {
      const client = new AnthropicClient('test-api-key');
      const modelOptions = {
        model: 'claude-3-opus-2028',
      };
      client.setOptions({ modelOptions, promptCache: true });
      const anthropicClient = client.getClient(modelOptions);
      expect(anthropicClient._options.defaultHeaders).toBeDefined();
      expect(anthropicClient._options.defaultHeaders).toHaveProperty('anthropic-beta');
      expect(anthropicClient._options.defaultHeaders['anthropic-beta']).toBe(
        'prompt-caching-2024-07-31',
      );
    });

    describe('Claude 4 model headers', () => {
      it('should add "prompt-caching" beta header for claude-sonnet-4 model', () => {
        const client = new AnthropicClient('test-api-key');
        const modelOptions = {
          model: 'claude-sonnet-4-20250514',
        };
        client.setOptions({ modelOptions, promptCache: true });
        const anthropicClient = client.getClient(modelOptions);
        expect(anthropicClient._options.defaultHeaders).toBeDefined();
        expect(anthropicClient._options.defaultHeaders).toHaveProperty('anthropic-beta');
        expect(anthropicClient._options.defaultHeaders['anthropic-beta']).toBe(
          'prompt-caching-2024-07-31',
        );
      });

      it('should add "prompt-caching" beta header for claude-opus-4 model', () => {
        const client = new AnthropicClient('test-api-key');
        const modelOptions = {
          model: 'claude-opus-4-20250514',
        };
        client.setOptions({ modelOptions, promptCache: true });
        const anthropicClient = client.getClient(modelOptions);
        expect(anthropicClient._options.defaultHeaders).toBeDefined();
        expect(anthropicClient._options.defaultHeaders).toHaveProperty('anthropic-beta');
        expect(anthropicClient._options.defaultHeaders['anthropic-beta']).toBe(
          'prompt-caching-2024-07-31',
        );
      });

      it('should add "prompt-caching" beta header for claude-4-sonnet model', () => {
        const client = new AnthropicClient('test-api-key');
        const modelOptions = {
          model: 'claude-4-sonnet-20250514',
        };
        client.setOptions({ modelOptions, promptCache: true });
        const anthropicClient = client.getClient(modelOptions);
        expect(anthropicClient._options.defaultHeaders).toBeDefined();
        expect(anthropicClient._options.defaultHeaders).toHaveProperty('anthropic-beta');
        expect(anthropicClient._options.defaultHeaders['anthropic-beta']).toBe(
          'prompt-caching-2024-07-31',
        );
      });

      it('should add "prompt-caching" beta header for claude-4-opus model', () => {
        const client = new AnthropicClient('test-api-key');
        const modelOptions = {
          model: 'claude-4-opus-20250514',
        };
        client.setOptions({ modelOptions, promptCache: true });
        const anthropicClient = client.getClient(modelOptions);
        expect(anthropicClient._options.defaultHeaders).toBeDefined();
        expect(anthropicClient._options.defaultHeaders).toHaveProperty('anthropic-beta');
        expect(anthropicClient._options.defaultHeaders['anthropic-beta']).toBe(
          'prompt-caching-2024-07-31',
        );
      });
    });

    it('should not add beta header for claude-3-5-sonnet-latest model', () => {
      const client = new AnthropicClient('test-api-key');
      const modelOptions = {
        model: 'anthropic/claude-3-5-sonnet-latest',
      };
      client.setOptions({ modelOptions, promptCache: true });
      const anthropicClient = client.getClient(modelOptions);
      expect(anthropicClient._options.defaultHeaders).toBeUndefined();
    });

    it('should not add beta header for other models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-2',
        },
      });
      const anthropicClient = client.getClient();
      expect(anthropicClient._options.defaultHeaders).toBeUndefined();
    });
  });

  describe('calculateCurrentTokenCount', () => {
    let client;

    beforeEach(() => {
      client = new AnthropicClient('test-api-key');
    });

    it('should calculate correct token count when usage is provided', () => {
      const tokenCountMap = {
        msg1: 10,
        msg2: 20,
        currentMsg: 30,
      };
      const currentMessageId = 'currentMsg';
      const usage = {
        input_tokens: 70,
        output_tokens: 50,
      };

      const result = client.calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage });

      expect(result).toBe(40); // 70 - (10 + 20) = 40
    });

    it('should return original estimate if calculation results in negative value', () => {
      const tokenCountMap = {
        msg1: 40,
        msg2: 50,
        currentMsg: 30,
      };
      const currentMessageId = 'currentMsg';
      const usage = {
        input_tokens: 80,
        output_tokens: 50,
      };

      const result = client.calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage });

      expect(result).toBe(30); // Original estimate
    });

    it('should handle cache creation and read input tokens', () => {
      const tokenCountMap = {
        msg1: 10,
        msg2: 20,
        currentMsg: 30,
      };
      const currentMessageId = 'currentMsg';
      const usage = {
        input_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 20,
        output_tokens: 40,
      };

      const result = client.calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage });

      expect(result).toBe(50); // (50 + 10 + 20) - (10 + 20) = 50
    });

    it('should handle missing usage properties', () => {
      const tokenCountMap = {
        msg1: 10,
        msg2: 20,
        currentMsg: 30,
      };
      const currentMessageId = 'currentMsg';
      const usage = {
        output_tokens: 40,
      };

      const result = client.calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage });

      expect(result).toBe(30); // Original estimate
    });

    it('should handle empty tokenCountMap', () => {
      const tokenCountMap = {};
      const currentMessageId = 'currentMsg';
      const usage = {
        input_tokens: 50,
        output_tokens: 40,
      };

      const result = client.calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage });

      expect(result).toBe(50);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('should handle zero values in usage', () => {
      const tokenCountMap = {
        msg1: 10,
        currentMsg: 20,
      };
      const currentMessageId = 'currentMsg';
      const usage = {
        input_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
      };

      const result = client.calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage });

      expect(result).toBe(20); // Should return original estimate
      expect(Number.isNaN(result)).toBe(false);
    });

    it('should handle undefined usage', () => {
      const tokenCountMap = {
        msg1: 10,
        currentMsg: 20,
      };
      const currentMessageId = 'currentMsg';
      const usage = undefined;

      const result = client.calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage });

      expect(result).toBe(20); // Should return original estimate
      expect(Number.isNaN(result)).toBe(false);
    });

    it('should handle non-numeric values in tokenCountMap', () => {
      const tokenCountMap = {
        msg1: 'ten',
        currentMsg: 20,
      };
      const currentMessageId = 'currentMsg';
      const usage = {
        input_tokens: 30,
        output_tokens: 10,
      };

      const result = client.calculateCurrentTokenCount({ tokenCountMap, currentMessageId, usage });

      expect(result).toBe(30); // Should return 30 (input_tokens) - 0 (ignored 'ten') = 30
      expect(Number.isNaN(result)).toBe(false);
    });
  });

  describe('maxOutputTokens handling for different models', () => {
    it('should not cap maxOutputTokens for Claude 3.5 Sonnet models', () => {
      const client = new AnthropicClient('test-api-key');
      const highTokenValue = anthropicSettings.legacy.maxOutputTokens.default * 10;

      client.setOptions({
        modelOptions: {
          model: 'claude-3-5-sonnet',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(highTokenValue);

      // Test with decimal notation
      client.setOptions({
        modelOptions: {
          model: 'claude-3.5-sonnet',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(highTokenValue);
    });

    it('should not cap maxOutputTokens for Claude 3.7 models', () => {
      const client = new AnthropicClient('test-api-key');
      const highTokenValue = anthropicSettings.legacy.maxOutputTokens.default * 2;

      client.setOptions({
        modelOptions: {
          model: 'claude-3-7-sonnet',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(highTokenValue);

      // Test with decimal notation
      client.setOptions({
        modelOptions: {
          model: 'claude-3.7-sonnet',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(highTokenValue);
    });

    it('should not cap maxOutputTokens for Claude 4 Sonnet models', () => {
      const client = new AnthropicClient('test-api-key');
      const highTokenValue = anthropicSettings.legacy.maxOutputTokens.default * 10; // 40,960 tokens

      client.setOptions({
        modelOptions: {
          model: 'claude-sonnet-4-20250514',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(highTokenValue);
    });

    it('should not cap maxOutputTokens for Claude 4 Opus models', () => {
      const client = new AnthropicClient('test-api-key');
      const highTokenValue = anthropicSettings.legacy.maxOutputTokens.default * 6; // 24,576 tokens (under 32K limit)

      client.setOptions({
        modelOptions: {
          model: 'claude-opus-4-20250514',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(highTokenValue);
    });

    it('should cap maxOutputTokens for Claude 3.5 Haiku models', () => {
      const client = new AnthropicClient('test-api-key');
      const highTokenValue = anthropicSettings.legacy.maxOutputTokens.default * 2;

      client.setOptions({
        modelOptions: {
          model: 'claude-3-5-haiku',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(
        anthropicSettings.legacy.maxOutputTokens.default,
      );

      // Test with decimal notation
      client.setOptions({
        modelOptions: {
          model: 'claude-3.5-haiku',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(
        anthropicSettings.legacy.maxOutputTokens.default,
      );
    });

    it('should cap maxOutputTokens for Claude 3 Haiku and Opus models', () => {
      const client = new AnthropicClient('test-api-key');
      const highTokenValue = anthropicSettings.legacy.maxOutputTokens.default * 2;

      // Test haiku
      client.setOptions({
        modelOptions: {
          model: 'claude-3-haiku',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(
        anthropicSettings.legacy.maxOutputTokens.default,
      );

      // Test opus
      client.setOptions({
        modelOptions: {
          model: 'claude-3-opus',
          maxOutputTokens: highTokenValue,
        },
      });

      expect(client.modelOptions.maxOutputTokens).toBe(
        anthropicSettings.legacy.maxOutputTokens.default,
      );
    });
  });

  describe('topK/topP parameters for different models', () => {
    beforeEach(() => {
      // Mock the SplitStreamHandler
      jest.spyOn(SplitStreamHandler.prototype, 'handle').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should include top_k and top_p parameters for non-claude-3.7 models', async () => {
      const client = new AnthropicClient('test-api-key');

      // Create a mock async generator function
      async function* mockAsyncGenerator() {
        yield { type: 'message_start', message: { usage: {} } };
        yield { delta: { text: 'Test response' } };
        yield { type: 'message_delta', usage: {} };
      }

      // Mock createResponse to return the async generator
      jest.spyOn(client, 'createResponse').mockImplementation(() => {
        return mockAsyncGenerator();
      });

      client.setOptions({
        modelOptions: {
          model: 'claude-3-opus',
          temperature: 0.7,
          topK: 10,
          topP: 0.9,
        },
      });

      // Mock getClient to capture the request options
      let capturedOptions = null;
      jest.spyOn(client, 'getClient').mockImplementation((options) => {
        capturedOptions = options;
        return {};
      });

      const payload = [{ role: 'user', content: 'Test message' }];
      await client.sendCompletion(payload, {});

      // Check the options passed to getClient
      expect(capturedOptions).toHaveProperty('top_k', 10);
      expect(capturedOptions).toHaveProperty('top_p', 0.9);
    });

    it('should include top_k and top_p parameters for claude-3-5-sonnet models', async () => {
      const client = new AnthropicClient('test-api-key');

      // Create a mock async generator function
      async function* mockAsyncGenerator() {
        yield { type: 'message_start', message: { usage: {} } };
        yield { delta: { text: 'Test response' } };
        yield { type: 'message_delta', usage: {} };
      }

      // Mock createResponse to return the async generator
      jest.spyOn(client, 'createResponse').mockImplementation(() => {
        return mockAsyncGenerator();
      });

      client.setOptions({
        modelOptions: {
          model: 'claude-3-5-sonnet',
          temperature: 0.7,
          topK: 10,
          topP: 0.9,
        },
      });

      // Mock getClient to capture the request options
      let capturedOptions = null;
      jest.spyOn(client, 'getClient').mockImplementation((options) => {
        capturedOptions = options;
        return {};
      });

      const payload = [{ role: 'user', content: 'Test message' }];
      await client.sendCompletion(payload, {});

      // Check the options passed to getClient
      expect(capturedOptions).toHaveProperty('top_k', 10);
      expect(capturedOptions).toHaveProperty('top_p', 0.9);
    });

    it('should not include top_k and top_p parameters for claude-3-7-sonnet models', async () => {
      const client = new AnthropicClient('test-api-key');

      // Create a mock async generator function
      async function* mockAsyncGenerator() {
        yield { type: 'message_start', message: { usage: {} } };
        yield { delta: { text: 'Test response' } };
        yield { type: 'message_delta', usage: {} };
      }

      // Mock createResponse to return the async generator
      jest.spyOn(client, 'createResponse').mockImplementation(() => {
        return mockAsyncGenerator();
      });

      client.setOptions({
        modelOptions: {
          model: 'claude-3-7-sonnet',
          temperature: 0.7,
          topK: 10,
          topP: 0.9,
        },
      });

      // Mock getClient to capture the request options
      let capturedOptions = null;
      jest.spyOn(client, 'getClient').mockImplementation((options) => {
        capturedOptions = options;
        return {};
      });

      const payload = [{ role: 'user', content: 'Test message' }];
      await client.sendCompletion(payload, {});

      // Check the options passed to getClient
      expect(capturedOptions).not.toHaveProperty('top_k');
      expect(capturedOptions).not.toHaveProperty('top_p');
    });

    it('should not include top_k and top_p parameters for models with decimal notation (claude-3.7)', async () => {
      const client = new AnthropicClient('test-api-key');

      // Create a mock async generator function
      async function* mockAsyncGenerator() {
        yield { type: 'message_start', message: { usage: {} } };
        yield { delta: { text: 'Test response' } };
        yield { type: 'message_delta', usage: {} };
      }

      // Mock createResponse to return the async generator
      jest.spyOn(client, 'createResponse').mockImplementation(() => {
        return mockAsyncGenerator();
      });

      client.setOptions({
        modelOptions: {
          model: 'claude-3.7-sonnet',
          temperature: 0.7,
          topK: 10,
          topP: 0.9,
        },
      });

      // Mock getClient to capture the request options
      let capturedOptions = null;
      jest.spyOn(client, 'getClient').mockImplementation((options) => {
        capturedOptions = options;
        return {};
      });

      const payload = [{ role: 'user', content: 'Test message' }];
      await client.sendCompletion(payload, {});

      // Check the options passed to getClient
      expect(capturedOptions).not.toHaveProperty('top_k');
      expect(capturedOptions).not.toHaveProperty('top_p');
    });
  });

  it('should include top_k and top_p parameters for Claude-3.7 models when thinking is explicitly disabled', async () => {
    const client = new AnthropicClient('test-api-key', {
      modelOptions: {
        model: 'claude-3-7-sonnet',
        temperature: 0.7,
        topK: 10,
        topP: 0.9,
      },
      thinking: false,
    });

    async function* mockAsyncGenerator() {
      yield { type: 'message_start', message: { usage: {} } };
      yield { delta: { text: 'Test response' } };
      yield { type: 'message_delta', usage: {} };
    }

    jest.spyOn(client, 'createResponse').mockImplementation(() => {
      return mockAsyncGenerator();
    });

    let capturedOptions = null;
    jest.spyOn(client, 'getClient').mockImplementation((options) => {
      capturedOptions = options;
      return {};
    });

    const payload = [{ role: 'user', content: 'Test message' }];
    await client.sendCompletion(payload, {});

    expect(capturedOptions).toHaveProperty('topK', 10);
    expect(capturedOptions).toHaveProperty('topP', 0.9);

    client.setOptions({
      modelOptions: {
        model: 'claude-3.7-sonnet',
        temperature: 0.7,
        topK: 10,
        topP: 0.9,
      },
      thinking: false,
    });

    await client.sendCompletion(payload, {});

    expect(capturedOptions).toHaveProperty('topK', 10);
    expect(capturedOptions).toHaveProperty('topP', 0.9);
  });

  describe('isClaudeLatest', () => {
    it('should set isClaudeLatest to true for claude-3 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-3-sonnet-20240229',
        },
      });
      expect(client.isClaudeLatest).toBe(true);
    });

    it('should set isClaudeLatest to true for claude-3.5 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-3.5-sonnet-20240229',
        },
      });
      expect(client.isClaudeLatest).toBe(true);
    });

    it('should set isClaudeLatest to true for claude-sonnet-4 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-sonnet-4-20240229',
        },
      });
      expect(client.isClaudeLatest).toBe(true);
    });

    it('should set isClaudeLatest to true for claude-opus-4 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-opus-4-20240229',
        },
      });
      expect(client.isClaudeLatest).toBe(true);
    });

    it('should set isClaudeLatest to true for claude-3.5-haiku models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-3.5-haiku-20240229',
        },
      });
      expect(client.isClaudeLatest).toBe(true);
    });

    it('should set isClaudeLatest to false for claude-2 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-2',
        },
      });
      expect(client.isClaudeLatest).toBe(false);
    });

    it('should set isClaudeLatest to false for claude-instant models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-instant',
        },
      });
      expect(client.isClaudeLatest).toBe(false);
    });

    it('should set isClaudeLatest to false for claude-sonnet-3 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-sonnet-3-20240229',
        },
      });
      expect(client.isClaudeLatest).toBe(false);
    });

    it('should set isClaudeLatest to false for claude-opus-3 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-opus-3-20240229',
        },
      });
      expect(client.isClaudeLatest).toBe(false);
    });

    it('should set isClaudeLatest to false for claude-haiku-3 models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-haiku-3-20240229',
        },
      });
      expect(client.isClaudeLatest).toBe(false);
    });
  });

  describe('configureReasoning', () => {
    it('should enable thinking for claude-opus-4 and claude-sonnet-4 models', async () => {
      const client = new AnthropicClient('test-api-key');
      // Create a mock async generator function
      async function* mockAsyncGenerator() {
        yield { type: 'message_start', message: { usage: {} } };
        yield { delta: { text: 'Test response' } };
        yield { type: 'message_delta', usage: {} };
      }

      // Mock createResponse to return the async generator
      jest.spyOn(client, 'createResponse').mockImplementation(() => {
        return mockAsyncGenerator();
      });

      // Test claude-opus-4
      client.setOptions({
        modelOptions: {
          model: 'claude-opus-4-20250514',
        },
        thinking: true,
        thinkingBudget: 2000,
      });

      let capturedOptions = null;
      jest.spyOn(client, 'getClient').mockImplementation((options) => {
        capturedOptions = options;
        return {};
      });

      const payload = [{ role: 'user', content: 'Test message' }];
      await client.sendCompletion(payload, {});

      expect(capturedOptions).toHaveProperty('thinking');
      expect(capturedOptions.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 2000,
      });

      // Test claude-sonnet-4
      client.setOptions({
        modelOptions: {
          model: 'claude-sonnet-4-20250514',
        },
        thinking: true,
        thinkingBudget: 2000,
      });

      await client.sendCompletion(payload, {});

      expect(capturedOptions).toHaveProperty('thinking');
      expect(capturedOptions.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 2000,
      });
    });
  });
});

describe('Claude Model Tests', () => {
  it('should handle Claude 3 and 4 series models correctly', () => {
    const client = new AnthropicClient('test-key');
    // Claude 3 series models
    const claude3Models = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20240620',
      'claude-3-5-haiku-20240620',
      'claude-3.5-sonnet-20240620',
      'claude-3.5-haiku-20240620',
      'claude-3.7-sonnet-20240620',
      'claude-3.7-haiku-20240620',
      'anthropic/claude-3-opus-20240229',
      'claude-3-opus-20240229/anthropic',
    ];

    // Claude 4 series models
    const claude4Models = [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-4-sonnet-20250514',
      'claude-4-opus-20250514',
      'anthropic/claude-sonnet-4-20250514',
      'claude-sonnet-4-20250514/anthropic',
    ];

    // Test Claude 3 series
    claude3Models.forEach((model) => {
      client.setOptions({ modelOptions: { model } });
      expect(
        /claude-[3-9]/.test(client.modelOptions.model) ||
          /claude-(?:sonnet|opus|haiku)-[4-9]/.test(client.modelOptions.model),
      ).toBe(true);
    });

    // Test Claude 4 series
    claude4Models.forEach((model) => {
      client.setOptions({ modelOptions: { model } });
      expect(
        /claude-[3-9]/.test(client.modelOptions.model) ||
          /claude-(?:sonnet|opus|haiku)-[4-9]/.test(client.modelOptions.model),
      ).toBe(true);
    });

    // Test non-Claude 3/4 models
    const nonClaudeModels = ['claude-2', 'claude-instant', 'gpt-4', 'gpt-3.5-turbo'];

    nonClaudeModels.forEach((model) => {
      client.setOptions({ modelOptions: { model } });
      expect(
        /claude-[3-9]/.test(client.modelOptions.model) ||
          /claude-(?:sonnet|opus|haiku)-[4-9]/.test(client.modelOptions.model),
      ).toBe(false);
    });
  });
});
