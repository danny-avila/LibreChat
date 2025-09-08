import { getOpenAIConfig } from './config';

describe('getOpenAIConfig - Anthropic Compatibility', () => {
  describe('Anthropic via LiteLLM', () => {
    it('should handle basic Anthropic configuration with defaultParamsEndpoint', () => {
      const apiKey = 'sk-xxxx';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-sonnet-4',
          user: 'some_user_id',
        },
        reverseProxyUrl: 'http://host.docker.internal:4000/v1',
        proxy: '',
        headers: {},
        addParams: undefined,
        dropParams: undefined,
        customParams: {
          defaultParamsEndpoint: 'anthropic',
          paramDefinitions: [],
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-xxxx',
          model: 'claude-sonnet-4',
          stream: true,
          maxTokens: 8192,
          modelKwargs: {
            metadata: {
              user_id: 'some_user_id',
            },
            thinking: {
              type: 'enabled',
              budget_tokens: 2000,
            },
          },
        },
        configOptions: {
          baseURL: 'http://host.docker.internal:4000/v1',
          defaultHeaders: {
            'anthropic-beta': 'prompt-caching-2024-07-31,context-1m-2025-08-07',
          },
        },
        tools: [],
      });
    });

    it('should handle Claude 3.7 model with thinking enabled', () => {
      const apiKey = 'sk-yyyy';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-3.7-sonnet-20241022',
          user: 'user123',
          temperature: 0.7,
          thinking: true,
          thinkingBudget: 3000,
        },
        reverseProxyUrl: 'http://localhost:4000/v1',
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-yyyy',
          model: 'claude-3.7-sonnet-20241022',
          stream: true,
          temperature: 0.7,
          maxTokens: 8192,
          modelKwargs: {
            metadata: {
              user_id: 'user123',
            },
            thinking: {
              type: 'enabled',
              budget_tokens: 3000,
            },
          },
        },
        configOptions: {
          baseURL: 'http://localhost:4000/v1',
          defaultHeaders: {
            'anthropic-beta':
              'token-efficient-tools-2025-02-19,output-128k-2025-02-19,prompt-caching-2024-07-31',
          },
        },
        tools: [],
      });
    });

    it('should handle Claude 3.7 model with thinking disabled (topP and topK included)', () => {
      const apiKey = 'sk-yyyy';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-3.7-sonnet-20241022',
          user: 'user123',
          temperature: 0.7,
          topP: 0.9,
          topK: 50,
          thinking: false,
        },
        reverseProxyUrl: 'http://localhost:4000/v1',
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-yyyy',
          model: 'claude-3.7-sonnet-20241022',
          stream: true,
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 8192,
          modelKwargs: {
            metadata: {
              user_id: 'user123',
            },
            topK: 50,
          },
        },
        configOptions: {
          baseURL: 'http://localhost:4000/v1',
          defaultHeaders: {
            'anthropic-beta':
              'token-efficient-tools-2025-02-19,output-128k-2025-02-19,prompt-caching-2024-07-31',
          },
        },
        tools: [],
      });
    });

    it('should handle Claude 3.5 sonnet with special headers', () => {
      const apiKey = 'sk-zzzz';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-3.5-sonnet-20240620',
          user: 'user456',
          maxOutputTokens: 4096,
        },
        reverseProxyUrl: 'https://api.anthropic.proxy.com/v1',
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-zzzz',
          model: 'claude-3.5-sonnet-20240620',
          stream: true,
          maxTokens: 4096,
          modelKwargs: {
            metadata: {
              user_id: 'user456',
            },
          },
        },
        configOptions: {
          baseURL: 'https://api.anthropic.proxy.com/v1',
          defaultHeaders: {
            'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15,prompt-caching-2024-07-31',
          },
        },
        tools: [],
      });
    });

    it('should apply anthropic-beta headers based on model pattern', () => {
      const apiKey = 'sk-custom';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-3-sonnet',
        },
        reverseProxyUrl: 'http://custom.proxy/v1',
        headers: {
          'Custom-Header': 'custom-value',
          Authorization: 'Bearer custom-token',
        },
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-custom',
          model: 'claude-3-sonnet',
          stream: true,
          maxTokens: 8192,
          modelKwargs: {
            metadata: {
              user_id: undefined,
            },
          },
        },
        configOptions: {
          baseURL: 'http://custom.proxy/v1',
          defaultHeaders: {
            'Custom-Header': 'custom-value',
            Authorization: 'Bearer custom-token',
            'anthropic-beta': 'prompt-caching-2024-07-31',
          },
        },
        tools: [],
      });
    });

    it('should handle models that do not match Claude patterns', () => {
      const apiKey = 'sk-other';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'gpt-4-turbo',
          user: 'userGPT',
          temperature: 0.8,
        },
        reverseProxyUrl: 'http://litellm:4000/v1',
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-other',
          model: 'gpt-4-turbo',
          stream: true,
          temperature: 0.8,
          maxTokens: 8192,
          modelKwargs: {
            metadata: {
              user_id: 'userGPT',
            },
          },
        },
        configOptions: {
          baseURL: 'http://litellm:4000/v1',
        },
        tools: [],
      });
    });

    it('should handle dropParams only working in OpenAI path not Anthropic', () => {
      const apiKey = 'sk-drop';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-3-opus-20240229',
          user: 'userDrop',
          temperature: 0.5,
          maxOutputTokens: 2048,
          thinking: true,
          thinkingBudget: 5000,
        },
        reverseProxyUrl: 'http://proxy.litellm/v1',
        dropParams: ['temperature', 'user'],
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-drop',
          model: 'claude-3-opus-20240229',
          stream: true,
          temperature: 0.5,
          maxTokens: 2048,
          modelKwargs: {
            metadata: {
              user_id: 'userDrop',
            },
          },
        },
        configOptions: {
          baseURL: 'http://proxy.litellm/v1',
          defaultHeaders: {
            'anthropic-beta': 'prompt-caching-2024-07-31',
          },
        },
        tools: [],
      });
    });

    it('should handle empty user string', () => {
      const apiKey = 'sk-edge';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-2.1',
          user: '',
          temperature: 0,
        },
        reverseProxyUrl: 'http://litellm/v1',
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-edge',
          model: 'claude-2.1',
          stream: true,
          temperature: 0,
          maxTokens: 8192,
          modelKwargs: {
            metadata: {
              user_id: '',
            },
          },
        },
        configOptions: {
          baseURL: 'http://litellm/v1',
        },
        tools: [],
      });
    });

    it('should handle web_search tool', () => {
      const apiKey = 'sk-search';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-3-opus-20240229',
          user: 'searchUser',
          web_search: true,
        },
        reverseProxyUrl: 'http://litellm/v1',
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-search',
          model: 'claude-3-opus-20240229',
          stream: true,
          maxTokens: 8192,
          modelKwargs: {
            metadata: {
              user_id: 'searchUser',
            },
          },
        },
        configOptions: {
          baseURL: 'http://litellm/v1',
          defaultHeaders: {
            'anthropic-beta': 'prompt-caching-2024-07-31',
          },
        },
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
      });
    });

    it('should properly transform Anthropic config with invocationKwargs', () => {
      const apiKey = 'sk-test';
      const endpoint = 'Anthropic (via LiteLLM)';
      const options = {
        modelOptions: {
          model: 'claude-3.5-haiku-20241022',
          user: 'testUser',
          topP: 0.9,
          topK: 40,
        },
        reverseProxyUrl: 'http://litellm/v1',
        customParams: {
          defaultParamsEndpoint: 'anthropic',
        },
        endpoint: 'Anthropic (via LiteLLM)',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          apiKey: 'sk-test',
          model: 'claude-3.5-haiku-20241022',
          stream: true,
          topP: 0.9,
          maxTokens: 8192,
          modelKwargs: {
            metadata: {
              user_id: 'testUser',
            },
            topK: 40,
          },
        },
        configOptions: {
          baseURL: 'http://litellm/v1',
          defaultHeaders: {
            'anthropic-beta': 'prompt-caching-2024-07-31',
          },
        },
        tools: [],
      });
    });
  });
});
