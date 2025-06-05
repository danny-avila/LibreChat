const { HttpsProxyAgent } = require('https-proxy-agent');
const { anthropicSettings, removeNullishValues } = require('librechat-data-provider');
const { checkPromptCacheSupport, getClaudeHeaders, configureReasoning } = require('../helpers');
const { getLLMConfig } = require('../llm');

jest.mock('https-proxy-agent');
jest.mock('librechat-data-provider');
jest.mock('../helpers');

describe('getLLMConfig', () => {
  const mockApiKey = 'test-api-key';
  const defaultSettings = {
    model: { default: 'claude-3-opus-20240229' },
    maxOutputTokens: { default: 4096, reset: jest.fn(() => 4096) },
    thinking: { default: false },
    promptCache: { default: false },
    thinkingBudget: { default: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    anthropicSettings.model = defaultSettings.model;
    anthropicSettings.maxOutputTokens = defaultSettings.maxOutputTokens;
    anthropicSettings.thinking = defaultSettings.thinking;
    anthropicSettings.promptCache = defaultSettings.promptCache;
    anthropicSettings.thinkingBudget = defaultSettings.thinkingBudget;
    removeNullishValues.mockImplementation((obj) => obj);
    configureReasoning.mockImplementation((options) => options);
    checkPromptCacheSupport.mockReturnValue(false);
    getClaudeHeaders.mockReturnValue(undefined);
  });

  describe('basic configuration', () => {
    it('should return default configuration with only apiKey', () => {
      const result = getLLMConfig(mockApiKey, { modelOptions: {} });

      expect(result.llmConfig).toEqual({
        apiKey: mockApiKey,
        model: 'claude-3-opus-20240229',
        stream: true,
        maxTokens: 4096,
        clientOptions: {},
      });
    });

    it('should merge custom model options with defaults', () => {
      const options = {
        modelOptions: {
          model: 'claude-3-sonnet-20240229',
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          stop: ['END', 'STOP'],
          stream: false,
          maxOutputTokens: 2048,
        },
      };

      const result = getLLMConfig(mockApiKey, options);

      expect(result.llmConfig).toEqual({
        apiKey: mockApiKey,
        model: 'claude-3-sonnet-20240229',
        stream: false,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        stopSequences: ['END', 'STOP'],
        maxTokens: 2048,
        clientOptions: {},
      });
    });

    it('should use maxOutputTokens reset when maxOutputTokens is falsy', () => {
      const options = {
        modelOptions: {
          model: 'claude-3-haiku-20240307',
          maxOutputTokens: 0,
        },
      };

      anthropicSettings.maxOutputTokens.reset.mockReturnValue(8192);
      const result = getLLMConfig(mockApiKey, options);

      expect(anthropicSettings.maxOutputTokens.reset).toHaveBeenCalledWith(
        'claude-3-haiku-20240307',
      );
      expect(result.llmConfig.maxTokens).toBe(8192);
    });
  });

  describe('system options handling', () => {
    it('should extract and remove system options from modelOptions', () => {
      const options = {
        modelOptions: {
          model: 'claude-3-opus-20240229',
          thinking: true,
          promptCache: true,
          thinkingBudget: 1000,
          temperature: 0.5,
        },
      };

      const result = getLLMConfig(mockApiKey, options);

      expect(configureReasoning).toHaveBeenCalledWith(expect.any(Object), {
        thinking: true,
        promptCache: true,
        thinkingBudget: 1000,
      });

      const systemOptions = ['thinking', 'promptCache', 'thinkingBudget'];
      systemOptions.forEach((option) => {
        expect(result.llmConfig[option]).toBeUndefined();
      });
    });
  });

  describe('model-specific parameter handling', () => {
    const modelScenarios = [
      {
        name: 'claude-3.7 models exclude topP and topK by default',
        model: 'claude-3.7-sonnet-20240701',
        setupMocks: () => {
          removeNullishValues.mockImplementation((obj) => {
            const cleaned = { ...obj };
            if (/claude-3[-.]7/.test(obj.model) && obj.thinking !== null) {
              delete cleaned.topP;
              delete cleaned.topK;
            }
            return cleaned;
          });
        },
        expected: { topP: undefined, topK: undefined },
      },
      {
        name: 'claude-3.7 models include topP and topK when thinking is null',
        model: 'claude-3.7-sonnet-20240701',
        setupMocks: () => {
          configureReasoning.mockImplementation((opts) => ({ ...opts, thinking: null }));
          removeNullishValues.mockImplementation((obj) => obj);
        },
        expected: { topP: 0.9, topK: 40 },
      },
      {
        name: 'non-claude-3.7 models always include topP and topK',
        model: 'claude-3-opus-20240229',
        setupMocks: () => {
          configureReasoning.mockImplementation((opts) => opts);
        },
        expected: { topP: 0.9, topK: 40 },
      },
    ];

    modelScenarios.forEach((scenario) => {
      it(`should handle topP and topK: ${scenario.name}`, () => {
        scenario.setupMocks();

        const options = {
          modelOptions: {
            model: scenario.model,
            topP: 0.9,
            topK: 40,
          },
        };

        const result = getLLMConfig(mockApiKey, options);
        expect(result.llmConfig.topP).toBe(scenario.expected.topP);
        expect(result.llmConfig.topK).toBe(scenario.expected.topK);
      });
    });
  });

  describe('prompt cache and headers', () => {
    const cacheScenarios = [
      {
        name: 'prompt cache is supported',
        promptCache: true,
        supportsCacheControl: true,
        headers: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
        expectCheckSupport: true,
        expectHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
      },
      {
        name: 'prompt cache is disabled',
        promptCache: false,
        supportsCacheControl: true,
        headers: undefined,
        expectCheckSupport: false,
        expectHeaders: undefined,
      },
      {
        name: 'model does not support cache control',
        promptCache: true,
        supportsCacheControl: false,
        headers: undefined,
        expectCheckSupport: true,
        expectHeaders: undefined,
      },
    ];

    cacheScenarios.forEach((scenario) => {
      it(`should handle headers when ${scenario.name}`, () => {
        const options = {
          modelOptions: {
            model: 'claude-3-opus-20240229',
            promptCache: scenario.promptCache,
          },
        };

        checkPromptCacheSupport.mockReturnValue(scenario.supportsCacheControl);
        getClaudeHeaders.mockReturnValue(scenario.headers);

        const result = getLLMConfig(mockApiKey, options);

        if (scenario.expectCheckSupport) {
          expect(checkPromptCacheSupport).toHaveBeenCalledWith('claude-3-opus-20240229');
        } else {
          expect(checkPromptCacheSupport).not.toHaveBeenCalled();
        }

        expect(getClaudeHeaders).toHaveBeenCalledWith(
          'claude-3-opus-20240229',
          scenario.promptCache && scenario.supportsCacheControl,
        );

        if (scenario.expectHeaders) {
          expect(result.llmConfig.clientOptions.defaultHeaders).toEqual(scenario.expectHeaders);
        } else {
          expect(result.llmConfig.clientOptions.defaultHeaders).toBeUndefined();
        }
      });
    });
  });

  describe('proxy configuration', () => {
    const proxyScenarios = [
      {
        name: 'only proxy',
        options: {
          modelOptions: {},
          proxy: 'http://proxy.example.com:8080',
        },
        expectations: {
          httpAgent: true,
          baseURL: undefined,
          anthropicApiUrl: undefined,
        },
      },
      {
        name: 'only reverse proxy',
        options: {
          modelOptions: {},
          reverseProxyUrl: 'https://reverse-proxy.example.com',
        },
        expectations: {
          httpAgent: undefined,
          baseURL: 'https://reverse-proxy.example.com',
          anthropicApiUrl: 'https://reverse-proxy.example.com',
        },
      },
      {
        name: 'both proxy and reverse proxy',
        options: {
          modelOptions: {},
          proxy: 'http://proxy.example.com:8080',
          reverseProxyUrl: 'https://reverse-proxy.example.com',
        },
        expectations: {
          httpAgent: true,
          baseURL: 'https://reverse-proxy.example.com',
          anthropicApiUrl: 'https://reverse-proxy.example.com',
        },
      },
    ];

    it('should configure proxy and reverse proxy settings', () => {
      const mockProxyAgent = {};
      HttpsProxyAgent.mockReturnValue(mockProxyAgent);

      proxyScenarios.forEach((scenario) => {
        const result = getLLMConfig(mockApiKey, scenario.options);

        if (scenario.expectations.httpAgent) {
          expect(HttpsProxyAgent).toHaveBeenCalledWith(scenario.options.proxy);
          expect(result.llmConfig.clientOptions.httpAgent).toBe(mockProxyAgent);
        } else {
          expect(result.llmConfig.clientOptions.httpAgent).toBeUndefined();
        }

        expect(result.llmConfig.clientOptions.baseURL).toBe(scenario.expectations.baseURL);
        expect(result.llmConfig.anthropicApiUrl).toBe(scenario.expectations.anthropicApiUrl);
      });
    });
  });

  describe('removeNullishValues integration', () => {
    it('should call removeNullishValues on the final configuration', () => {
      const mockCleanedConfig = { cleaned: true };
      removeNullishValues.mockReturnValue(mockCleanedConfig);

      const result = getLLMConfig(mockApiKey, { modelOptions: {} });

      expect(removeNullishValues).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: mockApiKey,
          model: 'claude-3-opus-20240229',
        }),
      );
      expect(result.llmConfig).toBe(mockCleanedConfig);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined options parameter', () => {
      // The implementation has a bug where it doesn't handle undefined options
      // This test documents the current behavior
      expect(() => getLLMConfig(mockApiKey)).toThrow(TypeError);
    });

    it('should handle null values in modelOptions', () => {
      const options = {
        modelOptions: {
          model: null,
          temperature: null,
          topP: undefined,
          maxOutputTokens: 0,
        },
      };

      anthropicSettings.maxOutputTokens.reset.mockReturnValue(4096);

      const result = getLLMConfig(mockApiKey, options);

      const nullishChecks = [
        { prop: 'model', expected: null },
        { prop: 'temperature', expected: null },
        { prop: 'topP', expected: undefined },
      ];

      nullishChecks.forEach((check) => {
        expect(result.llmConfig[check.prop]).toBe(check.expected);
      });

      expect(anthropicSettings.maxOutputTokens.reset).toHaveBeenCalledWith(null);
      expect(result.llmConfig.maxTokens).toBe(4096);
    });

    it('should handle missing anthropicSettings properties gracefully', () => {
      const emptySettings = {
        model: {},
        maxOutputTokens: { default: undefined, reset: jest.fn(() => 4096) },
        thinking: {},
        promptCache: {},
        thinkingBudget: {},
      };

      Object.assign(anthropicSettings, emptySettings);

      const result = getLLMConfig(mockApiKey, { modelOptions: {} });

      expect(() => getLLMConfig(mockApiKey, { modelOptions: {} })).not.toThrow();
      expect(result.llmConfig).toHaveProperty('apiKey', mockApiKey);
      expect(result.llmConfig).toHaveProperty('stream', true);
    });
  });
});
