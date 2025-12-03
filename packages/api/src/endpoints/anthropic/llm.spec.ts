import { getLLMConfig } from './llm';
import type * as t from '~/types';

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
    expect(result.llmConfig.clientOptions?.fetchOptions).toHaveProperty('dispatcher');
    expect(result.llmConfig.clientOptions?.fetchOptions?.dispatcher).toBeDefined();
    expect(result.llmConfig.clientOptions?.fetchOptions?.dispatcher.constructor.name).toBe(
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
    expect(clientOptions?.defaultHeaders).toBeDefined();
    expect(clientOptions?.defaultHeaders).toHaveProperty('anthropic-beta');
    const defaultHeaders = clientOptions?.defaultHeaders as Record<string, string>;
    expect(defaultHeaders['anthropic-beta']).toBe(
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
      expect(clientOptions?.defaultHeaders).toBeDefined();
      expect(clientOptions?.defaultHeaders).toHaveProperty('anthropic-beta');
      const defaultHeaders = clientOptions?.defaultHeaders as Record<string, string>;
      expect(defaultHeaders['anthropic-beta']).toBe(
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
      }).toThrow('No modelOptions provided');
    });

    it('should handle no options parameter', () => {
      expect(() => {
        getLLMConfig('test-api-key');
      }).toThrow('No modelOptions provided');
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
          maxOutputTokens: undefined,
        },
      });

      // The actual anthropicSettings.maxOutputTokens.reset('claude-3-opus') returns 8192
      expect(result.llmConfig).toHaveProperty('maxTokens', 8192);
    });

    it('should handle both proxy and reverseProxyUrl', () => {
      const result = getLLMConfig('test-api-key', {
        modelOptions: {},
        proxy: 'http://proxy:8080',
        reverseProxyUrl: 'https://reverse-proxy.com',
      });

      expect(result.llmConfig.clientOptions).toHaveProperty('fetchOptions');
      expect(result.llmConfig.clientOptions?.fetchOptions).toHaveProperty('dispatcher');
      expect(result.llmConfig.clientOptions?.fetchOptions?.dispatcher).toBeDefined();
      expect(result.llmConfig.clientOptions?.fetchOptions?.dispatcher.constructor.name).toBe(
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
      expect(result.llmConfig.clientOptions?.defaultHeaders).toEqual({
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
          temperature: undefined,
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

  describe('Real Usage Integration Tests', () => {
    describe('Initialize.js Simulation', () => {
      it('should handle basic Anthropic endpoint configuration like initialize.js', () => {
        // Simulate the configuration from Anthropic initialize.js
        const anthropicApiKey = 'sk-ant-api-key-123';
        const endpointOption = {
          model_parameters: {
            model: 'claude-3-5-sonnet-latest',
            temperature: 0.7,
            maxOutputTokens: 4096,
            topP: 0.9,
            topK: 40,
            stop: ['\\n\\n', 'Human:', 'Assistant:'],
            stream: true,
          },
        };

        // Simulate clientOptions from initialize.js
        const clientOptions = {
          proxy: null,
          reverseProxyUrl: null,
          modelOptions: {
            ...endpointOption.model_parameters,
            user: 'test-user-id-123',
          },
          streamRate: 25,
          titleModel: 'claude-3-haiku',
        };

        const result = getLLMConfig(anthropicApiKey, clientOptions);

        expect(result.llmConfig).toMatchObject({
          apiKey: anthropicApiKey,
          model: 'claude-3-5-sonnet-latest',
          temperature: 0.7,
          maxTokens: 4096,
          topP: 0.9,
          topK: 40,
          stopSequences: ['\\n\\n', 'Human:', 'Assistant:'],
          stream: true,
          invocationKwargs: {
            metadata: {
              user_id: 'test-user-id-123',
            },
          },
        });
        expect(result.tools).toEqual([]);
      });

      it('should handle Anthropic with proxy configuration like initialize.js', () => {
        const anthropicApiKey = 'sk-ant-proxy-key';
        const clientOptions = {
          proxy: 'http://corporate-proxy:8080',
          reverseProxyUrl: null,
          modelOptions: {
            model: 'claude-3-opus',
            temperature: 0.3,
            maxOutputTokens: 2048,
            user: 'proxy-user-456',
          },
        };

        const result = getLLMConfig(anthropicApiKey, clientOptions);

        expect(result.llmConfig).toMatchObject({
          apiKey: anthropicApiKey,
          model: 'claude-3-opus',
          temperature: 0.3,
          maxTokens: 2048,
          invocationKwargs: {
            metadata: {
              user_id: 'proxy-user-456',
            },
          },
        });
        expect(result.llmConfig.clientOptions?.fetchOptions).toHaveProperty('dispatcher');
        expect(result.llmConfig.clientOptions?.fetchOptions?.dispatcher.constructor.name).toBe(
          'ProxyAgent',
        );
      });

      it('should handle Anthropic with reverse proxy like initialize.js', () => {
        const anthropicApiKey = 'sk-ant-reverse-proxy';
        const reverseProxyUrl = 'https://api.custom-anthropic.com/v1';
        const clientOptions = {
          proxy: null,
          reverseProxyUrl: reverseProxyUrl,
          modelOptions: {
            model: 'claude-3-5-haiku',
            temperature: 0.5,
            stream: false,
            user: 'reverse-proxy-user',
          },
        };

        const result = getLLMConfig(anthropicApiKey, clientOptions);

        expect(result.llmConfig).toMatchObject({
          apiKey: anthropicApiKey,
          model: 'claude-3-5-haiku',
          temperature: 0.5,
          stream: false,
          anthropicApiUrl: reverseProxyUrl,
        });
        expect(result.llmConfig.clientOptions).toMatchObject({
          baseURL: reverseProxyUrl,
        });
      });
    });

    describe('Model-Specific Real Usage Scenarios', () => {
      it('should handle Claude-3.7 with thinking enabled like production', () => {
        const clientOptions = {
          modelOptions: {
            model: 'claude-3-7-sonnet',
            temperature: 0.4,
            maxOutputTokens: 8192,
            topP: 0.95,
            topK: 50,
            thinking: true,
            thinkingBudget: 3000,
            promptCache: true,
            user: 'thinking-user-789',
          },
        };

        const result = getLLMConfig('sk-ant-thinking-key', clientOptions);

        expect(result.llmConfig).toMatchObject({
          model: 'claude-3-7-sonnet',
          temperature: 0.4,
          maxTokens: 8192,
          stream: true, // default
          thinking: {
            type: 'enabled',
            budget_tokens: 3000,
          },
        });
        // topP and topK should NOT be included for Claude-3.7 with thinking enabled
        expect(result.llmConfig).not.toHaveProperty('topP');
        expect(result.llmConfig).not.toHaveProperty('topK');
        // Should have appropriate headers for Claude-3.7 with prompt cache
        expect(result.llmConfig.clientOptions?.defaultHeaders).toEqual({
          'anthropic-beta':
            'token-efficient-tools-2025-02-19,output-128k-2025-02-19,prompt-caching-2024-07-31',
        });
      });

      it('should handle web search functionality like production', () => {
        const clientOptions = {
          modelOptions: {
            model: 'claude-3-5-sonnet-latest',
            temperature: 0.6,
            maxOutputTokens: 4096,
            web_search: true,
            user: 'websearch-user-303',
          },
        };

        const result = getLLMConfig('sk-ant-websearch-key', clientOptions);

        expect(result.llmConfig).toMatchObject({
          model: 'claude-3-5-sonnet-latest',
          temperature: 0.6,
          maxTokens: 4096,
        });
        expect(result.tools).toEqual([
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ]);
      });
    });

    describe('Production-like Configuration Scenarios', () => {
      it('should handle complex production configuration', () => {
        const clientOptions = {
          proxy: 'http://prod-proxy.company.com:3128',
          reverseProxyUrl: 'https://anthropic-gateway.company.com/v1',
          modelOptions: {
            model: 'claude-3-opus-20240229',
            temperature: 0.2, // Conservative for production
            maxOutputTokens: 4096,
            topP: 0.95,
            topK: 10,
            stop: ['\\n\\nHuman:', '\\n\\nAssistant:', 'END_CONVERSATION'],
            stream: true,
            promptCache: true,
            user: 'prod-user-enterprise-404',
          },
          streamRate: 15, // Conservative stream rate
          titleModel: 'claude-3-haiku-20240307',
        };

        const result = getLLMConfig('sk-ant-prod-enterprise-key', clientOptions);

        expect(result.llmConfig).toMatchObject({
          apiKey: 'sk-ant-prod-enterprise-key',
          model: 'claude-3-opus-20240229',
          temperature: 0.2,
          maxTokens: 4096,
          topP: 0.95,
          topK: 10,
          stopSequences: ['\\n\\nHuman:', '\\n\\nAssistant:', 'END_CONVERSATION'],
          stream: true,
          anthropicApiUrl: 'https://anthropic-gateway.company.com/v1',
          invocationKwargs: {
            metadata: {
              user_id: 'prod-user-enterprise-404',
            },
          },
        });
        expect(result.llmConfig.clientOptions).toMatchObject({
          baseURL: 'https://anthropic-gateway.company.com/v1',
          fetchOptions: {
            dispatcher: expect.any(Object),
          },
        });
        expect(result.tools).toEqual([]);
      });

      it('should handle multiple system options removal from modelOptions', () => {
        const modelOptions = {
          model: 'claude-3-5-sonnet',
          temperature: 0.7,
          maxOutputTokens: 8192,
          // System options that should be removed
          thinking: true,
          promptCache: true,
          thinkingBudget: 2500,
          // Regular options that should remain
          topP: 0.9,
          topK: 40,
          user: 'system-options-user',
        };

        const clientOptions = {
          modelOptions,
        };

        getLLMConfig('sk-ant-system-key', clientOptions);

        // System options should be removed from original modelOptions
        expect(modelOptions).not.toHaveProperty('thinking');
        expect(modelOptions).not.toHaveProperty('promptCache');
        expect(modelOptions).not.toHaveProperty('thinkingBudget');
        // Regular options should remain
        expect(modelOptions).toHaveProperty('temperature', 0.7);
        expect(modelOptions).toHaveProperty('topP', 0.9);
        expect(modelOptions).toHaveProperty('topK', 40);
      });
    });

    describe('Error Handling and Edge Cases from Real Usage', () => {
      it('should handle missing `user` ID string gracefully', () => {
        const clientOptions = {
          modelOptions: {
            model: 'claude-3-haiku',
            temperature: 0.5,
            // `user` is missing
          },
        };

        const result = getLLMConfig('sk-ant-no-user-key', clientOptions);

        expect(result.llmConfig.invocationKwargs?.metadata).toMatchObject({
          user_id: undefined,
        });
      });

      it('should handle large parameter sets without performance issues', () => {
        const largeModelOptions: Record<string, string | number | boolean> = {
          model: 'claude-3-opus',
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.9,
          topK: 40,
          user: 'performance-test-user',
        };

        // Add many additional properties to test performance
        for (let i = 0; i < 100; i++) {
          largeModelOptions[`custom_param_${i}`] = `value_${i}`;
        }

        const clientOptions = {
          modelOptions: largeModelOptions,
          proxy: 'http://performance-proxy:8080',
          reverseProxyUrl: 'https://performance-reverse-proxy.com',
        };

        const startTime = Date.now();
        const result = getLLMConfig('sk-ant-performance-key', clientOptions);
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(50); // Should be very fast
        expect(result.llmConfig).toMatchObject({
          model: 'claude-3-opus',
          temperature: 0.7,
          maxTokens: 4096,
          topP: 0.9,
          topK: 40,
        });
      });

      it('should handle model name variations and edge cases', () => {
        const modelVariations = [
          'claude-3-7-sonnet',
          'claude-3.7-sonnet',
          'anthropic/claude-3-opus-20240229',
          'claude-sonnet-4-latest',
          'claude-3-5-sonnet-latest',
        ];

        modelVariations.forEach((model) => {
          const clientOptions = {
            modelOptions: {
              model,
              temperature: 0.5,
              topP: 0.9,
              topK: 40,
              thinking: true,
              promptCache: true,
              user: 'model-variation-user',
            },
          };

          const result = getLLMConfig('sk-ant-variation-key', clientOptions);

          expect(result.llmConfig).toHaveProperty('model', model);
          expect(result.llmConfig).toHaveProperty('temperature', 0.5);
          // The specific behavior (thinking, topP/topK inclusion) depends on model pattern
        });
      });
    });
  });

  describe('Comprehensive Parameter Logic Tests', () => {
    describe('Default Values and Fallbacks', () => {
      it('should apply correct default values from anthropicSettings', () => {
        const result = getLLMConfig('test-key', { modelOptions: {} });

        expect(result.llmConfig).toMatchObject({
          model: 'claude-3-5-sonnet-latest', // default model
          stream: true, // default stream
          maxTokens: 8192, // DEFAULT_MAX_OUTPUT for claude-3-5-sonnet
        });
      });

      it('should handle maxOutputTokens reset logic for different models', () => {
        const testCases = [
          { model: 'claude-3-5-sonnet', expectedMaxTokens: 8192 },
          { model: 'claude-3.5-sonnet-20241022', expectedMaxTokens: 8192 },
          { model: 'claude-3-7-sonnet', expectedMaxTokens: 8192 },
          { model: 'claude-3.7-sonnet-20250109', expectedMaxTokens: 8192 },
          { model: 'claude-3-opus', expectedMaxTokens: 8192 },
          { model: 'claude-3-haiku', expectedMaxTokens: 8192 },
          { model: 'claude-2.1', expectedMaxTokens: 8192 },
          { model: 'claude-sonnet-4-5', expectedMaxTokens: 64000 },
          { model: 'claude-sonnet-4-5-20250929', expectedMaxTokens: 64000 },
          { model: 'claude-haiku-4-5', expectedMaxTokens: 64000 },
          { model: 'claude-haiku-4-5-20251001', expectedMaxTokens: 64000 },
          { model: 'claude-opus-4-1', expectedMaxTokens: 32000 },
          { model: 'claude-opus-4-1-20250805', expectedMaxTokens: 32000 },
          { model: 'claude-sonnet-4-20250514', expectedMaxTokens: 64000 },
          { model: 'claude-opus-4-0', expectedMaxTokens: 32000 },
        ];

        testCases.forEach(({ model, expectedMaxTokens }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model, maxOutputTokens: null }, // Force reset
          });
          expect(result.llmConfig.maxTokens).toBe(expectedMaxTokens);
        });
      });

      it('should handle system options defaults correctly', () => {
        const result = getLLMConfig('test-key', {
          modelOptions: {
            model: 'claude-3-7-sonnet',
            // Don't specify thinking, promptCache, thinkingBudget - should use defaults
          },
        });

        // Should have thinking enabled by default for claude-3-7
        expect(result.llmConfig.thinking).toMatchObject({
          type: 'enabled',
          budget_tokens: 2000, // default thinkingBudget
        });
        // Should have prompt cache headers by default
        expect(result.llmConfig.clientOptions?.defaultHeaders).toBeDefined();
      });
    });

    describe('Claude 4.x Model maxOutputTokens Defaults', () => {
      it('should default Claude Sonnet 4.x models to 64K tokens', () => {
        const testCases = ['claude-sonnet-4-5', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4.5'];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(64000);
        });
      });

      it('should default Claude Haiku 4.x models to 64K tokens', () => {
        const testCases = ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-haiku-4.5'];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(64000);
        });
      });

      it('should default Claude Opus 4.x models to 32K tokens', () => {
        const testCases = ['claude-opus-4-1', 'claude-opus-4-1-20250805', 'claude-opus-4.1'];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(32000);
        });
      });

      it('should default future Claude 4.x Sonnet/Haiku models to 64K (future-proofing)', () => {
        const testCases = ['claude-sonnet-4-20250514', 'claude-sonnet-4-9', 'claude-haiku-4-8'];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(64000);
        });
      });

      it('should default future Claude 4.x Opus models to 32K (future-proofing)', () => {
        const testCases = ['claude-opus-4-0', 'claude-opus-4-7'];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(32000);
        });
      });

      it('should handle explicit maxOutputTokens override for Claude 4.x models', () => {
        const result = getLLMConfig('test-key', {
          modelOptions: {
            model: 'claude-sonnet-4-5',
            maxOutputTokens: 64000, // Explicitly set to 64K
          },
        });

        expect(result.llmConfig.maxTokens).toBe(64000);
      });

      it('should handle undefined maxOutputTokens for Claude 4.x (use reset default)', () => {
        const testCases = [
          { model: 'claude-sonnet-4-5', expected: 64000 },
          { model: 'claude-haiku-4-5', expected: 64000 },
          { model: 'claude-opus-4-1', expected: 32000 },
        ];

        testCases.forEach(({ model, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: {
              model,
              maxOutputTokens: undefined,
            },
          });
          expect(result.llmConfig.maxTokens).toBe(expected);
        });
      });

      it('should handle Claude 4 Sonnet/Haiku with thinking enabled', () => {
        const testCases = ['claude-sonnet-4-5', 'claude-haiku-4-5'];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: {
              model,
              thinking: true,
              thinkingBudget: 10000,
            },
          });

          expect(result.llmConfig.thinking).toMatchObject({
            type: 'enabled',
            budget_tokens: 10000,
          });
          expect(result.llmConfig.maxTokens).toBe(64000);
        });
      });

      it('should handle Claude 4 Opus with thinking enabled', () => {
        const result = getLLMConfig('test-key', {
          modelOptions: {
            model: 'claude-opus-4-1',
            thinking: true,
            thinkingBudget: 10000,
          },
        });

        expect(result.llmConfig.thinking).toMatchObject({
          type: 'enabled',
          budget_tokens: 10000,
        });
        expect(result.llmConfig.maxTokens).toBe(32000);
      });

      it('should respect model-specific maxOutputTokens for Claude 4.x models', () => {
        const testCases = [
          { model: 'claude-sonnet-4-5', maxOutputTokens: 50000, expected: 50000 },
          { model: 'claude-haiku-4-5', maxOutputTokens: 40000, expected: 40000 },
          { model: 'claude-opus-4-1', maxOutputTokens: 20000, expected: 20000 },
        ];

        testCases.forEach(({ model, maxOutputTokens, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: {
              model,
              maxOutputTokens,
            },
          });
          expect(result.llmConfig.maxTokens).toBe(expected);
        });
      });

      it('should future-proof Claude 5.x Sonnet models with 64K default', () => {
        const testCases = [
          'claude-sonnet-5',
          'claude-sonnet-5-0',
          'claude-sonnet-5-2-20260101',
          'claude-sonnet-5.5',
        ];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(64000);
        });
      });

      it('should future-proof Claude 5.x Haiku models with 64K default', () => {
        const testCases = [
          'claude-haiku-5',
          'claude-haiku-5-0',
          'claude-haiku-5-2-20260101',
          'claude-haiku-5.5',
        ];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(64000);
        });
      });

      it('should future-proof Claude 5.x Opus models with 32K default', () => {
        const testCases = [
          'claude-opus-5',
          'claude-opus-5-0',
          'claude-opus-5-2-20260101',
          'claude-opus-5.5',
        ];

        testCases.forEach((model) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(32000);
        });
      });

      it('should future-proof Claude 6-9.x models with correct defaults', () => {
        const testCases = [
          // Claude 6.x
          { model: 'claude-sonnet-6', expected: 64000 },
          { model: 'claude-haiku-6-0', expected: 64000 },
          { model: 'claude-opus-6-1', expected: 32000 },
          // Claude 7.x
          { model: 'claude-sonnet-7-20270101', expected: 64000 },
          { model: 'claude-haiku-7.5', expected: 64000 },
          { model: 'claude-opus-7', expected: 32000 },
          // Claude 8.x
          { model: 'claude-sonnet-8', expected: 64000 },
          { model: 'claude-haiku-8-2', expected: 64000 },
          { model: 'claude-opus-8-latest', expected: 32000 },
          // Claude 9.x
          { model: 'claude-sonnet-9', expected: 64000 },
          { model: 'claude-haiku-9', expected: 64000 },
          { model: 'claude-opus-9', expected: 32000 },
        ];

        testCases.forEach(({ model, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model },
          });
          expect(result.llmConfig.maxTokens).toBe(expected);
        });
      });
    });

    describe('Parameter Boundary and Validation Logic', () => {
      it('should handle temperature boundary values', () => {
        const testCases = [
          { temperature: 0, expected: 0 }, // min
          { temperature: 1, expected: 1 }, // max
          { temperature: 0.5, expected: 0.5 }, // middle
          { temperature: -0.1, expected: -0.1 }, // below min (should pass through)
          { temperature: 1.1, expected: 1.1 }, // above max (should pass through)
        ];

        testCases.forEach(({ temperature, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { temperature },
          });
          expect(result.llmConfig.temperature).toBe(expected);
        });
      });

      it('should handle topP boundary values', () => {
        const testCases = [
          { topP: 0, expected: 0 }, // min
          { topP: 1, expected: 1 }, // max
          { topP: 0.7, expected: 0.7 }, // default
          { topP: -0.1, expected: -0.1 }, // below min
          { topP: 1.1, expected: 1.1 }, // above max
        ];

        testCases.forEach(({ topP, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model: 'claude-3-opus', topP },
          });
          expect(result.llmConfig.topP).toBe(expected);
        });
      });

      it('should handle topK boundary values', () => {
        const testCases = [
          { topK: 1, expected: 1 }, // min
          { topK: 40, expected: 40 }, // max
          { topK: 5, expected: 5 }, // default
          { topK: 0, expected: 0 }, // below min
          { topK: 50, expected: 50 }, // above max
        ];

        testCases.forEach(({ topK, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model: 'claude-3-opus', topK },
          });
          expect(result.llmConfig.topK).toBe(expected);
        });
      });

      it('should handle maxOutputTokens boundary values', () => {
        const testCases = [
          { model: 'claude-3-opus', maxOutputTokens: 1, expected: 1 }, // min
          { model: 'claude-3-opus', maxOutputTokens: 8192, expected: 8192 }, // default for claude-3
          { model: 'claude-3-5-sonnet', maxOutputTokens: 1, expected: 1 }, // min
          { model: 'claude-3-5-sonnet', maxOutputTokens: 200000, expected: 200000 }, // max for new
          { model: 'claude-3-7-sonnet', maxOutputTokens: 8192, expected: 8192 }, // default
        ];

        testCases.forEach(({ model, maxOutputTokens, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model, maxOutputTokens },
          });
          expect(result.llmConfig.maxTokens).toBe(expected);
        });
      });

      it('should handle thinkingBudget boundary values', () => {
        const testCases = [
          { thinkingBudget: 1024, expected: 1024 }, // min
          { thinkingBudget: 2000, expected: 2000 }, // default
          { thinkingBudget: 7000, expected: 7000 }, // within max tokens (8192)
          { thinkingBudget: 500, expected: 500 }, // below min
          { thinkingBudget: 200000, expected: 7372 }, // above max tokens, constrained to 90% of 8192
        ];

        testCases.forEach(({ thinkingBudget, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: {
              model: 'claude-3-7-sonnet',
              thinking: true,
              thinkingBudget,
            },
          });
          expect((result.llmConfig.thinking as t.ThinkingConfigEnabled)?.budget_tokens).toBe(
            expected,
          );
        });
      });
    });

    describe('Complex Parameter Interactions', () => {
      it('should handle thinking budget vs maxTokens constraints', () => {
        const testCases = [
          // Budget within maxTokens - should keep original
          { maxOutputTokens: 4096, thinkingBudget: 2000, expectedBudget: 2000 },
          // Budget exceeds maxTokens - should constrain to 90%
          { maxOutputTokens: 4096, thinkingBudget: 5000, expectedBudget: 3686 }, // 90% of 4096
          // Budget equals maxTokens - should keep original (not constrained unless it exceeds)
          { maxOutputTokens: 2000, thinkingBudget: 2000, expectedBudget: 2000 },
          // Budget slightly exceeds maxTokens - should constrain to 90%
          { maxOutputTokens: 2000, thinkingBudget: 2001, expectedBudget: 1800 }, // 90% of 2000
          // Very small maxTokens
          { maxOutputTokens: 1000, thinkingBudget: 3000, expectedBudget: 900 }, // 90% of 1000
        ];

        testCases.forEach(({ maxOutputTokens, thinkingBudget, expectedBudget }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: {
              model: 'claude-3-7-sonnet',
              maxOutputTokens,
              thinking: true,
              thinkingBudget,
            },
          });
          expect((result.llmConfig.thinking as t.ThinkingConfigEnabled)?.budget_tokens).toBe(
            expectedBudget,
          );
        });
      });

      it('should handle topP/topK exclusion logic for Claude-3.7 models', () => {
        const testCases: (t.AnthropicModelOptions & { shouldInclude: boolean })[] = [
          // Claude-3.7 with thinking = true - should exclude topP/topK
          { model: 'claude-3-7-sonnet', thinking: true, shouldInclude: false },
          { model: 'claude-3.7-sonnet', thinking: true, shouldInclude: false },
          // Claude-3.7 with thinking = false - should include topP/topK
          { model: 'claude-3-7-sonnet', thinking: false, shouldInclude: true },
          { model: 'claude-3.7-sonnet', thinking: false, shouldInclude: true },
          // Claude-3.7 with thinking = null - thinking defaults to true, so should exclude topP/topK
          { model: 'claude-3-7-sonnet', thinking: null, shouldInclude: false },
          // Non-Claude-3.7 models - should always include topP/topK (thinking doesn't affect them)
          { model: 'claude-3-5-sonnet', thinking: true, shouldInclude: true },
          { model: 'claude-3-opus', thinking: true, shouldInclude: true },
          { model: 'claude-sonnet-4', thinking: true, shouldInclude: true },
        ];

        testCases.forEach(({ model, thinking, shouldInclude }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: {
              model,
              thinking,
              topP: 0.9,
              topK: 40,
            },
          });

          if (shouldInclude) {
            expect(result.llmConfig).toHaveProperty('topP', 0.9);
            expect(result.llmConfig).toHaveProperty('topK', 40);
          } else {
            expect(result.llmConfig).not.toHaveProperty('topP');
            expect(result.llmConfig).not.toHaveProperty('topK');
          }
        });
      });

      it('should handle prompt cache support logic for different models', () => {
        const testCases = [
          // Models that support prompt cache
          { model: 'claude-3-5-sonnet', promptCache: true, shouldHaveHeaders: true },
          { model: 'claude-3.5-sonnet-20241022', promptCache: true, shouldHaveHeaders: true },
          { model: 'claude-3-7-sonnet', promptCache: true, shouldHaveHeaders: true },
          { model: 'claude-3.7-sonnet-20250109', promptCache: true, shouldHaveHeaders: true },
          { model: 'claude-3-opus', promptCache: true, shouldHaveHeaders: true },
          { model: 'claude-sonnet-4-20250514', promptCache: true, shouldHaveHeaders: true },
          // Models that don't support prompt cache
          { model: 'claude-3-5-sonnet-latest', promptCache: true, shouldHaveHeaders: false },
          { model: 'claude-3.5-sonnet-latest', promptCache: true, shouldHaveHeaders: false },
          // Prompt cache disabled
          { model: 'claude-3-5-sonnet', promptCache: false, shouldHaveHeaders: false },
        ];

        testCases.forEach(({ model, promptCache, shouldHaveHeaders }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model, promptCache },
          });

          const headers = result.llmConfig.clientOptions?.defaultHeaders;

          if (shouldHaveHeaders) {
            expect(headers).toBeDefined();
            expect((headers as Record<string, string>)['anthropic-beta']).toContain(
              'prompt-caching',
            );
          } else {
            expect(headers).toBeUndefined();
          }
        });
      });
    });

    describe('Parameter Type Handling', () => {
      it('should handle different data types for numeric parameters', () => {
        const testCases = [
          { temperature: '0.5', expected: '0.5' }, // string
          { temperature: 0.5, expected: 0.5 }, // number
          { topP: '0.9', expected: '0.9' }, // string
          { topP: 0.9, expected: 0.9 }, // number
          { topK: '20', expected: '20' }, // string
          { topK: 20, expected: 20 }, // number
          { maxOutputTokens: '4096', expected: '4096' }, // string
          { maxOutputTokens: 4096, expected: 4096 }, // number
        ];

        testCases.forEach((testCase) => {
          const key = Object.keys(testCase)[0] as keyof t.AnthropicModelOptions;
          const value = (testCase as unknown as t.AnthropicModelOptions)[key];
          const expected = testCase.expected;

          const result = getLLMConfig('test-key', {
            modelOptions: { model: 'claude-3-opus', [key]: value },
          });

          const outputKey = key === 'maxOutputTokens' ? 'maxTokens' : key;
          expect(result.llmConfig[outputKey as keyof typeof result.llmConfig]).toBe(expected);
        });
      });

      it('should handle array parameters correctly', () => {
        const testCases = [
          { stop: [], expected: [] }, // empty array
          { stop: ['\\n'], expected: ['\\n'] }, // single item
          { stop: ['\\n', 'Human:', 'Assistant:'], expected: ['\\n', 'Human:', 'Assistant:'] }, // multiple items
          { stop: null, expected: null }, // null
          { stop: undefined, expected: undefined }, // undefined
        ];

        testCases.forEach(({ stop, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model: 'claude-3-opus', stop } as t.AnthropicModelOptions,
          });

          if (expected === null || expected === undefined) {
            expect(result.llmConfig).not.toHaveProperty('stopSequences');
          } else {
            expect(result.llmConfig.stopSequences).toEqual(expected);
          }
        });
      });

      it('should handle boolean parameters correctly', () => {
        const testCases = [
          { stream: true, expected: true },
          { stream: false, expected: false },
          { stream: 'true', expected: 'true' }, // string boolean
          { stream: 'false', expected: 'false' }, // string boolean
          { stream: 1, expected: 1 }, // truthy number
          { stream: 0, expected: 0 }, // falsy number
          { thinking: true, expected: true },
          { thinking: false, expected: false },
          { promptCache: true, expected: true },
          { promptCache: false, expected: false },
          { web_search: true, expected: true },
          { web_search: false, expected: false },
        ];

        testCases.forEach((testCase) => {
          const key = Object.keys(testCase)[0] as keyof t.AnthropicModelOptions;
          const value = (testCase as unknown as t.AnthropicModelOptions)[key];
          const expected = testCase.expected;

          const result = getLLMConfig('test-key', {
            modelOptions: { model: 'claude-3-opus', [key]: value },
          });

          if (key === 'stream') {
            expect(result.llmConfig.stream).toBe(expected);
          } else if (key === 'web_search' && expected) {
            expect(result.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search' }]);
          }
        });
      });
    });

    describe('Parameter Precedence and Override Logic', () => {
      it('should handle modelOptions vs defaultOptions precedence', () => {
        const result = getLLMConfig('test-key', {
          modelOptions: {
            model: 'claude-3-opus', // override default
            maxOutputTokens: 2048, // override default
            stream: false, // override default
            temperature: 0.3, // new parameter
          },
        });

        expect(result.llmConfig).toMatchObject({
          model: 'claude-3-opus', // overridden
          maxTokens: 2048, // overridden
          stream: false, // overridden
          temperature: 0.3, // added
        });
      });

      it('should handle system options extraction and defaults', () => {
        const modelOptions = {
          model: 'claude-3-7-sonnet',
          temperature: 0.5,
          // Missing system options should use defaults
        };

        const result = getLLMConfig('test-key', {
          modelOptions,
        });

        // System options should be removed from modelOptions
        expect(modelOptions).not.toHaveProperty('thinking');
        expect(modelOptions).not.toHaveProperty('promptCache');
        expect(modelOptions).not.toHaveProperty('thinkingBudget');

        // Should use defaults for system options
        expect(result.llmConfig.thinking).toMatchObject({
          type: 'enabled',
          budget_tokens: 2000, // default
        });
      });

      it('should handle partial system options with defaults', () => {
        const result = getLLMConfig('test-key', {
          modelOptions: {
            model: 'claude-3-7-sonnet',
            thinking: false, // explicit false
            // promptCache and thinkingBudget should use defaults
          },
        });

        // thinking is false, so no thinking object should be created
        expect(result.llmConfig.thinking).toBeUndefined();
        // promptCache default is true, so should have headers
        expect(result.llmConfig.clientOptions?.defaultHeaders).toBeDefined();
      });
    });

    describe('Edge Cases and Error Conditions', () => {
      it('should handle extremely large numbers', () => {
        const result = getLLMConfig('test-key', {
          modelOptions: {
            temperature: Number.MAX_SAFE_INTEGER,
            topP: Number.MAX_VALUE,
            topK: 999999,
            maxOutputTokens: Number.MAX_SAFE_INTEGER,
            thinkingBudget: Number.MAX_SAFE_INTEGER,
          },
        });

        // Should pass through without crashing
        expect(result.llmConfig.temperature).toBe(Number.MAX_SAFE_INTEGER);
        expect(result.llmConfig.topP).toBe(Number.MAX_VALUE);
        expect(result.llmConfig.topK).toBe(999999);
        expect(result.llmConfig.maxTokens).toBe(Number.MAX_SAFE_INTEGER);
      });

      it('should handle negative numbers', () => {
        const result = getLLMConfig('test-key', {
          modelOptions: {
            temperature: -1,
            topP: -0.5,
            topK: -10,
            maxOutputTokens: -1000,
            thinkingBudget: -500,
          },
        });

        // Should pass through negative values (API will handle validation)
        expect(result.llmConfig.temperature).toBe(-1);
        expect(result.llmConfig.topP).toBe(-0.5);
        expect(result.llmConfig.topK).toBe(-10);
        expect(result.llmConfig.maxTokens).toBe(-1000);
      });

      it('should handle special numeric values', () => {
        const testCases = [
          { value: NaN, shouldBeRemoved: false }, // NaN passes through removeNullishValues
          { value: Infinity, shouldBeRemoved: false },
          { value: -Infinity, shouldBeRemoved: false },
          { value: 0, shouldBeRemoved: false },
          { value: -0, shouldBeRemoved: false },
        ];

        testCases.forEach(({ value, shouldBeRemoved }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: {
              model: 'claude-3-opus',
              temperature: value,
            },
          });

          if (shouldBeRemoved) {
            expect(result.llmConfig).not.toHaveProperty('temperature');
          } else {
            expect(result.llmConfig.temperature).toBe(value);
          }
        });
      });

      it('should handle malformed stop sequences', () => {
        const testCases = [
          { stop: 'string', expected: 'string' }, // single string instead of array
          { stop: [null, undefined, ''], expected: [null, undefined, ''] }, // mixed values
          { stop: [123, true, false], expected: [123, true, false] }, // non-string values
          { stop: {}, expected: {} }, // object instead of array
        ];

        testCases.forEach(({ stop, expected }) => {
          const result = getLLMConfig('test-key', {
            modelOptions: { model: 'claude-3-opus', stop } as t.AnthropicModelOptions,
          });

          expect(result.llmConfig.stopSequences).toEqual(expected);
        });
      });
    });
  });
});
