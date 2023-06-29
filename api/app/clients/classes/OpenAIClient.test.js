const OpenAIClient = require('./OpenAIClient');

describe('OpenAIClient', () => {
  let client;
  const model = 'gpt-4';
  const parentMessageId = '1';
  const messages = [
    { role: 'user', sender: 'User', text: 'Hello', messageId: parentMessageId},
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
    client.refineMessages = jest.fn().mockResolvedValue({
      role: 'assistant',
      content: 'Refined answer',
      tokenCount: 30
    });
  });

  describe('setOptions', () => {
    it('should set the options correctly', () => {
      expect(client.apiKey).toBe('new-api-key');
      expect(client.modelOptions.model).toBe(model);
      expect(client.modelOptions.temperature).toBe(0.7);
    });
  });

  describe('getTokenCount & freeAndResetEncoder', () => {
    it('should return the correct token count', () => {
      const count = client.getTokenCount('Hello, world!');
      expect(count).toBeGreaterThan(0);
    });

    it('should reset the encoder', () => {
      client.freeAndResetEncoder();
      expect(client.gptEncoder).toBeDefined();
    });

    it('should reset the encoder and count when count reaches 25', () => {
      const freeAndResetEncoderSpy = jest.spyOn(client, 'freeAndResetEncoder');

      // Call getTokenCount 25 times
      for (let i = 0; i < 25; i++) {
        client.getTokenCount('test text');
      }

      expect(freeAndResetEncoderSpy).toHaveBeenCalled();
    });

    it('should not reset the encoder and count when count is less than 25', () => {
      const freeAndResetEncoderSpy = jest.spyOn(client, 'freeAndResetEncoder');

      // Call getTokenCount 24 times
      for (let i = 0; i < 24; i++) {
        client.getTokenCount('test text');
      }

      expect(freeAndResetEncoderSpy).not.toHaveBeenCalled();
    });

    it('should handle errors and reset the encoder', () => {
      const freeAndResetEncoderSpy = jest.spyOn(client, 'freeAndResetEncoder');
      client.gptEncoder.encode = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      client.getTokenCount('test text');

      expect(freeAndResetEncoderSpy).toHaveBeenCalled();
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
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: true });
      expect(result).toHaveProperty('prompt');
    });

    it('should build messages correctly for non-chat completion', async () => {
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: false });
      expect(result).toHaveProperty('prompt');
    });

    it('should build messages correctly with a promptPrefix', async () => {
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: true, promptPrefix: 'Test Prefix' });
      expect(result).toHaveProperty('prompt');
      const instructions = result.prompt.find(item => item.name === 'instructions');
      expect(instructions).toBeDefined();
      expect(instructions.content).toContain('Test Prefix');
    });

    it('should handle context strategy correctly', async () => {
      client.contextStrategy = 'refine';
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: true });
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('tokenCountMap');
    });

    it('should assign name property for user messages when options.name is set', async () => {
      client.options.name = 'Test User';
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: true });
      const hasUserWithName = result.prompt.some(item => item.role === 'user' && item.name === 'Test User');
      expect(hasUserWithName).toBe(true);
    });

    it('should calculate tokenCount for each message when contextStrategy is set', async () => {
      client.contextStrategy = 'refine';
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: true });
      const hasUserWithTokenCount = result.prompt.some(item => item.role === 'user' && item.tokenCount > 0);
      expect(hasUserWithTokenCount).toBe(true);
    });

    it('should handle promptPrefix from options when promptPrefix argument is not provided', async () => {
      client.options.promptPrefix = 'Test Prefix from options';
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: true });
      const instructions = result.prompt.find(item => item.name === 'instructions');
      expect(instructions.content).toContain('Test Prefix from options');
    });

    it('should handle case when neither promptPrefix argument nor options.promptPrefix is set', async () => {
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: true });
      const instructions = result.prompt.find(item => item.name === 'instructions');
      expect(instructions).toBeUndefined();
    });

    it('should handle case when getMessagesForConversation returns null or an empty array', async () => {
      const messages = [];
      const result = await client.buildMessages(messages, parentMessageId, { isChatCompletion: true });
      expect(result.prompt).toEqual([]);
    });
  });
});
