import {
  Verbosity,
  EModelEndpoint,
  ReasoningEffort,
  ReasoningSummary,
} from 'librechat-data-provider';
import { getOpenAIConfig } from './config';

describe('getOpenAIConfig - Backward Compatibility', () => {
  describe('OpenAI endpoint', () => {
    it('should handle GPT-5 model with reasoning and web search', () => {
      const apiKey = 'sk-proj-somekey';
      const endpoint = undefined;
      const options = {
        modelOptions: {
          model: 'gpt-5-nano',
          verbosity: Verbosity.high,
          reasoning_effort: ReasoningEffort.high,
          reasoning_summary: ReasoningSummary.detailed,
          useResponsesApi: true,
          web_search: true,
          user: 'some-user',
        },
        proxy: '',
        reverseProxyUrl: null,
        endpoint: EModelEndpoint.openAI,
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          streaming: true,
          model: 'gpt-5-nano',
          useResponsesApi: true,
          user: 'some-user',
          apiKey: 'sk-proj-somekey',
          reasoning: {
            effort: ReasoningEffort.high,
            summary: ReasoningSummary.detailed,
          },
          modelKwargs: {
            text: {
              verbosity: Verbosity.high,
            },
          },
        },
        configOptions: {},
        tools: [
          {
            type: 'web_search_preview',
          },
        ],
      });
    });
  });

  describe('OpenRouter endpoint', () => {
    it('should handle OpenRouter configuration with dropParams and custom headers', () => {
      const apiKey = 'sk-xxxx';
      const endpoint = 'OpenRouter';
      const options = {
        modelOptions: {
          model: 'qwen/qwen3-max',
          user: 'some-user',
        },
        reverseProxyUrl: 'https://gateway.ai.cloudflare.com/v1/account-id/gateway-id/openrouter',
        headers: {
          'x-librechat-thread-id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
          'x-test-key': '{{TESTING_USER_VAR}}',
        },
        proxy: '',
        dropParams: ['user'],
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          streaming: true,
          model: 'qwen/qwen3-max',
          include_reasoning: true,
          apiKey: 'sk-xxxx',
        },
        configOptions: {
          baseURL: 'https://gateway.ai.cloudflare.com/v1/account-id/gateway-id/openrouter',
          defaultHeaders: {
            'HTTP-Referer': 'https://librechat.ai',
            'X-Title': 'LibreChat',
            'x-librechat-thread-id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
            'x-test-key': '{{TESTING_USER_VAR}}',
          },
        },
        tools: [],
        provider: 'openrouter',
      });
    });
  });

  describe('Custom endpoints', () => {
    it('should handle Groq custom endpoint configuration', () => {
      const apiKey = 'gsk_somekey';
      const endpoint = 'groq';
      const options = {
        modelOptions: {
          model: 'qwen/qwen3-32b',
          user: 'some-user',
        },
        reverseProxyUrl: 'https://api.groq.com/openai/v1/',
        proxy: '',
        headers: {},
        endpoint: 'groq',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          streaming: true,
          model: 'qwen/qwen3-32b',
          user: 'some-user',
          apiKey: 'gsk_somekey',
        },
        configOptions: {
          baseURL: 'https://api.groq.com/openai/v1/',
          defaultHeaders: {},
        },
        tools: [],
      });
    });

    it('should handle Cloudflare Workers AI with custom headers and addParams', () => {
      const apiKey = 'someKey';
      const endpoint = 'Cloudflare Workers AI';
      const options = {
        modelOptions: {
          model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
          user: 'some-user',
        },
        reverseProxyUrl:
          'https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${CF_GATEWAY_ID}/workers-ai/v1',
        proxy: '',
        headers: {
          'x-librechat-thread-id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
          'x-test-key': '{{TESTING_USER_VAR}}',
        },
        addParams: {
          disableStreaming: true,
        },
        endpoint: 'Cloudflare Workers AI',
        endpointType: 'custom',
      };

      const result = getOpenAIConfig(apiKey, options, endpoint);

      expect(result).toEqual({
        llmConfig: {
          streaming: true,
          model: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
          user: 'some-user',
          disableStreaming: true,
          apiKey: 'someKey',
        },
        configOptions: {
          baseURL:
            'https://gateway.ai.cloudflare.com/v1/${CF_ACCOUNT_ID}/${CF_GATEWAY_ID}/workers-ai/v1',
          defaultHeaders: {
            'x-librechat-thread-id': '{{LIBRECHAT_BODY_CONVERSATIONID}}',
            'x-test-key': '{{TESTING_USER_VAR}}',
          },
        },
        tools: [],
      });
    });
  });
});
