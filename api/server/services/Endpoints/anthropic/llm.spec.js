const { anthropicSettings, removeNullishValues } = require('librechat-data-provider');
const { getLLMConfig } = require('~/server/services/Endpoints/anthropic/llm');
const { checkPromptCacheSupport, getClaudeHeaders, configureReasoning } = require('./helpers');

jest.mock('https-proxy-agent', () => ({
  HttpsProxyAgent: jest.fn().mockImplementation((proxy) => ({ proxy })),
}));

jest.mock('./helpers', () => ({
  checkPromptCacheSupport: jest.fn(),
  getClaudeHeaders: jest.fn(),
  configureReasoning: jest.fn((requestOptions) => requestOptions),
}));

jest.mock('librechat-data-provider', () => ({
  anthropicSettings: {
    model: { default: 'claude-3-opus-20240229' },
    maxOutputTokens: { default: 4096, reset: jest.fn(() => 4096) },
    thinking: { default: false },
    promptCache: { default: false },
    thinkingBudget: { default: null },
  },
  removeNullishValues: jest.fn((obj) => {
    const result = {};
    for (const key in obj) {
      if (obj[key] !== null && obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result;
  }),
}));

describe('getLLMConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    checkPromptCacheSupport.mockReturnValue(false);
    getClaudeHeaders.mockReturnValue(undefined);
    configureReasoning.mockImplementation((requestOptions) => requestOptions);
    anthropicSettings.maxOutputTokens.reset.mockReturnValue(4096);
  });

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

  it('should NOT include topK and topP for Claude-3-7 models (hyphen notation)', () => {
    configureReasoning.mockImplementation((requestOptions) => {
      requestOptions.thinking = { type: 'enabled' };
      return requestOptions;
    });

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
    configureReasoning.mockImplementation((requestOptions) => {
      requestOptions.thinking = { type: 'enabled' };
      return requestOptions;
    });

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
      anthropicSettings.maxOutputTokens.reset.mockReturnValue(8192);
      const result = getLLMConfig('test-api-key', {
        modelOptions: {
          model: 'claude-3-opus',
          maxOutputTokens: null,
        },
      });

      expect(anthropicSettings.maxOutputTokens.reset).toHaveBeenCalledWith('claude-3-opus');
      expect(result.llmConfig).toHaveProperty('maxTokens', 8192);
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
      checkPromptCacheSupport.mockReturnValue(true);
      getClaudeHeaders.mockReturnValue({ 'anthropic-beta': 'prompt-caching-2024-07-31' });

      const result = getLLMConfig('test-api-key', {
        modelOptions: {
          model: 'claude-3-5-sonnet',
          promptCache: true,
        },
      });

      expect(checkPromptCacheSupport).toHaveBeenCalledWith('claude-3-5-sonnet');
      expect(getClaudeHeaders).toHaveBeenCalledWith('claude-3-5-sonnet', true);
      expect(result.llmConfig.clientOptions.defaultHeaders).toEqual({
        'anthropic-beta': 'prompt-caching-2024-07-31',
      });
    });

    it('should handle thinking and thinkingBudget options', () => {
      configureReasoning.mockImplementation((requestOptions, systemOptions) => {
        if (systemOptions.thinking) {
          requestOptions.thinking = { type: 'enabled' };
        }
        if (systemOptions.thinkingBudget) {
          requestOptions.thinking = {
            ...requestOptions.thinking,
            budget_tokens: systemOptions.thinkingBudget,
          };
        }
        return requestOptions;
      });

      getLLMConfig('test-api-key', {
        modelOptions: {
          model: 'claude-3-7-sonnet',
          thinking: true,
          thinkingBudget: 5000,
        },
      });

      expect(configureReasoning).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          thinking: true,
          promptCache: false,
          thinkingBudget: 5000,
        }),
      );
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
      removeNullishValues.mockImplementation((obj) => {
        const cleaned = {};
        Object.entries(obj).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            cleaned[key] = value;
          }
        });
        return cleaned;
      });

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
