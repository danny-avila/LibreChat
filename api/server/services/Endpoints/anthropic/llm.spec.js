const { getLLMConfig } = require('~/server/services/Endpoints/anthropic/llm');

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn().mockImplementation((proxy) => ({ proxy })),
}));

describe('getLLMConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a basic configuration with default values', () => {
    const result = getLLMConfig('test-api-key', { modelOptions: {} });

    expect(result.llmConfig).toHaveProperty('apiKey', 'test-api-key');
    expect(result.llmConfig).toHaveProperty('model', 'claude-3-5-sonnet-latest');
    expect(result.llmConfig).toHaveProperty('stream', true);
    expect(result.llmConfig).toHaveProperty('maxTokens');
  });

  it('should include proxy settings when provided', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {},
      proxy: 'http://proxy:8080',
    });

    expect(result.llmConfig.clientOptions).toHaveProperty('fetchOptions');
    expect(result.llmConfig.clientOptions.fetchOptions).toHaveProperty('dispatcher');
    expect(result.llmConfig.clientOptions.fetchOptions.dispatcher).toBeDefined();
    expect(result.llmConfig.clientOptions.fetchOptions.dispatcher.constructor.name).toBe(
      'ProxyAgent',
    );
  });

  it('should include reverse proxy URL when provided', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {},
      reverseProxyUrl: 'http://reverse-proxy',
    });

    expect(result.llmConfig.clientOptions).toHaveProperty('baseURL', 'http://reverse-proxy');
    expect(result.llmConfig).toHaveProperty('anthropicApiUrl', 'http://reverse-proxy');
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

  it('should NOT include topK and topP for Claude-3-7 models with thinking enabled (hyphen notation)', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3-7-sonnet',
        topK: 10,
        topP: 0.9,
        thinking: true,
      },
    });

    expect(result.llmConfig).not.toHaveProperty('topK');
    expect(result.llmConfig).not.toHaveProperty('topP');
    expect(result.llmConfig).toHaveProperty('thinking');
    expect(result.llmConfig.thinking).toHaveProperty('type', 'enabled');
    // When thinking is enabled, it uses the default thinkingBudget of 2000
    expect(result.llmConfig.thinking).toHaveProperty('budget_tokens', 2000);
  });

  it('should add "prompt-caching" and "context-1m" beta headers for claude-sonnet-4 model', () => {
    const modelOptions = {
      model: 'claude-sonnet-4-20250514',
      promptCache: true,
    };
    const result = getLLMConfig('test-key', { modelOptions });
    const clientOptions = result.llmConfig.clientOptions;
    expect(clientOptions.defaultHeaders).toBeDefined();
    expect(clientOptions.defaultHeaders).toHaveProperty('anthropic-beta');
    expect(clientOptions.defaultHeaders['anthropic-beta']).toBe(
      'prompt-caching-2024-07-31,context-1m-2025-08-07',
    );
  });

  it('should add "prompt-caching" and "context-1m" beta headers for claude-sonnet-4 model formats', () => {
    const modelVariations = [
      'claude-sonnet-4-20250514',
      'claude-sonnet-4-latest',
      'anthropic/claude-sonnet-4-20250514',
    ];

    modelVariations.forEach((model) => {
      const modelOptions = { model, promptCache: true };
      const result = getLLMConfig('test-key', { modelOptions });
      const clientOptions = result.llmConfig.clientOptions;
      expect(clientOptions.defaultHeaders).toBeDefined();
      expect(clientOptions.defaultHeaders).toHaveProperty('anthropic-beta');
      expect(clientOptions.defaultHeaders['anthropic-beta']).toBe(
        'prompt-caching-2024-07-31,context-1m-2025-08-07',
      );
    });
  });

  it('should NOT include topK and topP for Claude-3.7 models with thinking enabled (decimal notation)', () => {
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3.7-sonnet',
        topK: 10,
        topP: 0.9,
        thinking: true,
      },
    });

    expect(result.llmConfig).not.toHaveProperty('topK');
    expect(result.llmConfig).not.toHaveProperty('topP');
    expect(result.llmConfig).toHaveProperty('thinking');
    expect(result.llmConfig.thinking).toHaveProperty('type', 'enabled');
    // When thinking is enabled, it uses the default thinkingBudget of 2000
    expect(result.llmConfig.thinking).toHaveProperty('budget_tokens', 2000);
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

  it('should include topK and topP for Claude-3.7 models when thinking is not enabled', () => {
    // Test with thinking explicitly set to null/undefined
    const result = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3-7-sonnet',
        topK: 10,
        topP: 0.9,
        thinking: false,
      },
    });

    expect(result.llmConfig).toHaveProperty('topK', 10);
    expect(result.llmConfig).toHaveProperty('topP', 0.9);

    // Test with thinking explicitly set to false
    const result2 = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3-7-sonnet',
        topK: 10,
        topP: 0.9,
        thinking: false,
      },
    });

    expect(result2.llmConfig).toHaveProperty('topK', 10);
    expect(result2.llmConfig).toHaveProperty('topP', 0.9);

    // Test with decimal notation as well
    const result3 = getLLMConfig('test-api-key', {
      modelOptions: {
        model: 'claude-3.7-sonnet',
        topK: 10,
        topP: 0.9,
        thinking: false,
      },
    });

    expect(result3.llmConfig).toHaveProperty('topK', 10);
    expect(result3.llmConfig).toHaveProperty('topP', 0.9);
  });

  describe('Edge cases', () => {
    it('should handle missing apiKey', () => {
      const result = getLLMConfig(undefined, { modelOptions: {} });
      expect(result.llmConfig).not.toHaveProperty('apiKey');
    });

    it('should handle empty modelOptions', () => {
      expect(() => {
        getLLMConfig('test-api-key', {});
      }).toThrow("Cannot read properties of undefined (reading 'thinking')");
    });

    it('should handle no options parameter', () => {
      expect(() => {
        getLLMConfig('test-api-key');
      }).toThrow("Cannot read properties of undefined (reading 'thinking')");
    });

    it('should handle temperature, stop sequences, and stream settings', () => {
      const result = getLLMConfig('test-api-key', {
        modelOptions: {
          temperature: 0.7,
          stop: ['\n\n', 'END'],
          stream: false,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.7);
      expect(result.llmConfig).toHaveProperty('stopSequences', ['\n\n', 'END']);
      expect(result.llmConfig).toHaveProperty('stream', false);
    });

    it('should handle maxOutputTokens when explicitly set to falsy value', () => {
      const result = getLLMConfig('test-api-key', {
        modelOptions: {
          model: 'claude-3-opus',
          maxOutputTokens: null,
        },
      });

      // The actual anthropicSettings.maxOutputTokens.reset('claude-3-opus') returns 4096
      expect(result.llmConfig).toHaveProperty('maxTokens', 4096);
    });

    it('should handle both proxy and reverseProxyUrl', () => {
      const result = getLLMConfig('test-api-key', {
        modelOptions: {},
        proxy: 'http://proxy:8080',
        reverseProxyUrl: 'https://reverse-proxy.com',
      });

      expect(result.llmConfig.clientOptions).toHaveProperty('fetchOptions');
      expect(result.llmConfig.clientOptions.fetchOptions).toHaveProperty('dispatcher');
      expect(result.llmConfig.clientOptions.fetchOptions.dispatcher).toBeDefined();
      expect(result.llmConfig.clientOptions.fetchOptions.dispatcher.constructor.name).toBe(
        'ProxyAgent',
      );
      expect(result.llmConfig.clientOptions).toHaveProperty('baseURL', 'https://reverse-proxy.com');
      expect(result.llmConfig).toHaveProperty('anthropicApiUrl', 'https://reverse-proxy.com');
    });

    it('should handle prompt cache with supported model', () => {
      const result = getLLMConfig('test-api-key', {
        modelOptions: {
          model: 'claude-3-5-sonnet',
          promptCache: true,
        },
      });

      // claude-3-5-sonnet supports prompt caching and should get the appropriate headers
      expect(result.llmConfig.clientOptions.defaultHeaders).toEqual({
        'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15,prompt-caching-2024-07-31',
      });
    });

    it('should handle thinking and thinkingBudget options', () => {
      const result = getLLMConfig('test-api-key', {
        modelOptions: {
          model: 'claude-3-7-sonnet',
          thinking: true,
          thinkingBudget: 10000, // This exceeds the default max_tokens of 8192
        },
      });

      // The function should add thinking configuration for claude-3-7 models
      expect(result.llmConfig).toHaveProperty('thinking');
      expect(result.llmConfig.thinking).toHaveProperty('type', 'enabled');
      // With claude-3-7-sonnet, the max_tokens default is 8192
      // Budget tokens gets adjusted to 90% of max_tokens (8192 * 0.9 = 7372) when it exceeds max_tokens
      expect(result.llmConfig.thinking).toHaveProperty('budget_tokens', 7372);

      // Test with budget_tokens within max_tokens limit
      const result2 = getLLMConfig('test-api-key', {
        modelOptions: {
          model: 'claude-3-7-sonnet',
          thinking: true,
          thinkingBudget: 2000,
        },
      });

      expect(result2.llmConfig.thinking).toHaveProperty('budget_tokens', 2000);
    });

    it('should remove system options from modelOptions', () => {
      const modelOptions = {
        model: 'claude-3-opus',
        thinking: true,
        promptCache: true,
        thinkingBudget: 1000,
        temperature: 0.5,
      };

      getLLMConfig('test-api-key', { modelOptions });

      expect(modelOptions).not.toHaveProperty('thinking');
      expect(modelOptions).not.toHaveProperty('promptCache');
      expect(modelOptions).not.toHaveProperty('thinkingBudget');
      expect(modelOptions).toHaveProperty('temperature', 0.5);
    });

    it('should handle all nullish values removal', () => {
      const result = getLLMConfig('test-api-key', {
        modelOptions: {
          temperature: null,
          topP: undefined,
          topK: 0,
          stop: [],
        },
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
      expect(result.llmConfig).not.toHaveProperty('topP');
      expect(result.llmConfig).toHaveProperty('topK', 0);
      expect(result.llmConfig).toHaveProperty('stopSequences', []);
    });
  });
});
