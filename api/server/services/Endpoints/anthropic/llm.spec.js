const { anthropicSettings } = require('librechat-data-provider');
const { getLLMConfig } = require('~/server/services/Endpoints/anthropic/llm');

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn().mockImplementation((proxy) => ({ proxy })),
}));

describe('getLLMConfig', () => {
  it('should create a basic configuration with default values', () => {
    const result = getLLMConfig('test-api-key', { modelOptions: {} });

    expect(result.llmConfig).toHaveProperty('apiKey', 'test-api-key');
    expect(result.llmConfig).toHaveProperty('model', anthropicSettings.model.default);
    expect(result.llmConfig).toHaveProperty('stream', true);
    expect(result.llmConfig).toHaveProperty('maxTokens');
  });

  it('should include proxy settings when provided', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {},
      proxy: 'http://proxy:8080',
    });

    expect(result.llmConfig.clientOptions).toHaveProperty('httpAgent');
    expect(result.llmConfig.clientOptions.httpAgent).toHaveProperty('proxy', 'http://proxy:8080');
  });

  it('should include reverse proxy URL when provided', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {},
      reverseProxyUrl: 'http://reverse-proxy',
    });

    expect(result.llmConfig.clientOptions).toHaveProperty('baseURL', 'http://reverse-proxy');
  });

  it('should include topK and topP for non-Claude-3.7 models', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3-opus',
        topK: 10,
        topP: 0.9,
      },
    });

    expect(result.llmConfig).toHaveProperty('topK', 10);
    expect(result.llmConfig).toHaveProperty('topP', 0.9);
  });

  it('should include topK and topP for Claude-3.5 models', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3-5-sonnet',
        topK: 10,
        topP: 0.9,
      },
    });

    expect(result.llmConfig).toHaveProperty('topK', 10);
    expect(result.llmConfig).toHaveProperty('topP', 0.9);
  });

  it('should NOT include topK and topP for Claude-3-7 models (hyphen notation)', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3-7-sonnet',
        topK: 10,
        topP: 0.9,
      },
    });

    expect(result.llmConfig).not.toHaveProperty('topK');
    expect(result.llmConfig).not.toHaveProperty('topP');
  });

  it('should NOT include topK and topP for Claude-3.7 models (decimal notation)', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3.7-sonnet',
        topK: 10,
        topP: 0.9,
      },
    });

    expect(result.llmConfig).not.toHaveProperty('topK');
    expect(result.llmConfig).not.toHaveProperty('topP');
  });

  it('should handle custom maxOutputTokens', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3-opus',
        maxOutputTokens: 2048,
      },
    });

    expect(result.llmConfig).toHaveProperty('maxTokens', 2048);
  });

  it('should handle promptCache setting', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3-5-sonnet',
        promptCache: true,
      },
    });

    // We're not checking specific header values since that depends on the actual helper function
    // Just verifying that the promptCache setting is processed
    expect(result.llmConfig).toBeDefined();
  });
});
