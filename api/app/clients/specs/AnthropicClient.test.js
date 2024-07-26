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
      text: 'What\'s up',
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
      expect(prompt).toContain('Human\'s name: John');
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

    it('should add beta header for claude-3-5-sonnet model', () => {
      const client = new AnthropicClient('test-api-key');
      const modelOptions = {
        model: 'claude-3-5-sonnet-20240307',
      };
      client.setOptions({ modelOptions });
      const anthropicClient = client.getClient(modelOptions);
      expect(anthropicClient._options.defaultHeaders).toBeDefined();
      expect(anthropicClient._options.defaultHeaders).toHaveProperty('anthropic-beta');
      expect(anthropicClient._options.defaultHeaders['anthropic-beta']).toBe(
        'max-tokens-3-5-sonnet-2024-07-15',
      );
    });

    it('should not add beta header for other models', () => {
      const client = new AnthropicClient('test-api-key');
      client.setOptions({
        modelOptions: {
          model: 'claude-2',
        },
      });
      const anthropicClient = client.getClient();
      expect(anthropicClient.defaultHeaders).not.toHaveProperty('anthropic-beta');
    });
  });
});
