import {
  Verbosity,
  EModelEndpoint,
  ReasoningEffort,
  ReasoningSummary,
} from 'librechat-data-provider';
import { getOpenAILLMConfig, extractDefaultParams, applyDefaultParams } from './llm';
import type * as t from '~/types';

describe('getOpenAILLMConfig', () => {
  describe('Basic Configuration', () => {
    it('should create a basic configuration with required fields', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
        },
      });

      expect(result.llmConfig).toHaveProperty('apiKey', 'test-api-key');
      expect(result.llmConfig).toHaveProperty('model', 'gpt-4');
      expect(result.llmConfig).toHaveProperty('streaming', true);
      expect(result.tools).toEqual([]);
    });

    it('should handle model options including temperature and penalties', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          temperature: 0.7,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.7);
      expect(result.llmConfig).toHaveProperty('frequencyPenalty', 0.5);
      expect(result.llmConfig).toHaveProperty('presencePenalty', 0.3);
    });

    it('should handle max_tokens conversion to maxTokens', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          max_tokens: 4096,
        },
      });

      expect(result.llmConfig).toHaveProperty('maxTokens', 4096);
      expect(result.llmConfig).not.toHaveProperty('max_tokens');
    });
  });

  describe('Empty String Handling (Issue Fix)', () => {
    it('should remove empty string values for numeric parameters', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          temperature: '' as unknown as number,
          topP: '' as unknown as number,
          max_tokens: '' as unknown as number,
        },
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
      expect(result.llmConfig).not.toHaveProperty('topP');
      expect(result.llmConfig).not.toHaveProperty('maxTokens');
      expect(result.llmConfig).not.toHaveProperty('max_tokens');
    });

    it('should remove empty string values for frequency and presence penalties', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          frequency_penalty: '' as unknown as number,
          presence_penalty: '' as unknown as number,
        },
      });

      expect(result.llmConfig).not.toHaveProperty('frequencyPenalty');
      expect(result.llmConfig).not.toHaveProperty('presencePenalty');
      expect(result.llmConfig).not.toHaveProperty('frequency_penalty');
      expect(result.llmConfig).not.toHaveProperty('presence_penalty');
    });

    it('should preserve valid numeric values while removing empty strings', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          temperature: 0.7,
          topP: '' as unknown as number,
          max_tokens: 4096,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.7);
      expect(result.llmConfig).not.toHaveProperty('topP');
      expect(result.llmConfig).toHaveProperty('maxTokens', 4096);
    });

    it('should preserve zero values (not treat them as empty)', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          temperature: 0,
          frequency_penalty: 0,
          presence_penalty: 0,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0);
      expect(result.llmConfig).toHaveProperty('frequencyPenalty', 0);
      expect(result.llmConfig).toHaveProperty('presencePenalty', 0);
    });
  });

  describe('OpenAI Reasoning Models (o1/o3/gpt-5)', () => {
    const reasoningModels = [
      'o1',
      'o1-mini',
      'o1-preview',
      'o1-pro',
      'o3',
      'o3-mini',
      'gpt-5',
      'gpt-5-pro',
      'gpt-5-turbo',
    ];

    const excludedParams = [
      'frequencyPenalty',
      'presencePenalty',
      'temperature',
      'topP',
      'logitBias',
      'n',
      'logprobs',
    ];

    it.each(reasoningModels)(
      'should exclude unsupported parameters for reasoning model: %s',
      (model) => {
        const result = getOpenAILLMConfig({
          apiKey: 'test-api-key',
          streaming: true,
          modelOptions: {
            model,
            temperature: 0.7,
            frequency_penalty: 0.5,
            presence_penalty: 0.3,
            topP: 0.9,
            logitBias: { '50256': -100 },
            n: 2,
            logprobs: true,
          } as Partial<t.OpenAIParameters>,
        });

        excludedParams.forEach((param) => {
          expect(result.llmConfig).not.toHaveProperty(param);
        });

        expect(result.llmConfig).toHaveProperty('model', model);
        expect(result.llmConfig).toHaveProperty('streaming', true);
      },
    );

    it('should preserve maxTokens for reasoning models', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'o1',
          max_tokens: 4096,
          temperature: 0.7,
        },
      });

      expect(result.llmConfig).toHaveProperty('maxTokens', 4096);
      expect(result.llmConfig).not.toHaveProperty('temperature');
    });

    it('should preserve other valid parameters for reasoning models', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'o1',
          max_tokens: 8192,
          stop: ['END'],
        },
      });

      expect(result.llmConfig).toHaveProperty('maxTokens', 8192);
      expect(result.llmConfig).toHaveProperty('stop', ['END']);
    });

    it('should handle GPT-5 max_tokens conversion to max_completion_tokens', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-5',
          max_tokens: 8192,
          stop: ['END'],
        },
      });

      expect(result.llmConfig.modelKwargs).toHaveProperty('max_completion_tokens', 8192);
      expect(result.llmConfig).not.toHaveProperty('maxTokens');
      expect(result.llmConfig).toHaveProperty('stop', ['END']);
    });

    it('should combine user dropParams with reasoning exclusion params', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'o3-mini',
          temperature: 0.7,
          stop: ['END'],
        },
        dropParams: ['stop'],
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
      expect(result.llmConfig).not.toHaveProperty('stop');
    });

    it('should NOT exclude parameters for non-reasoning models', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4-turbo',
          temperature: 0.7,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
          topP: 0.9,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.7);
      expect(result.llmConfig).toHaveProperty('frequencyPenalty', 0.5);
      expect(result.llmConfig).toHaveProperty('presencePenalty', 0.3);
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
    });

    it('should NOT exclude parameters for gpt-5.x versioned models (they support sampling params)', () => {
      const versionedModels = ['gpt-5.1', 'gpt-5.1-turbo', 'gpt-5.2', 'gpt-5.5-preview'];

      versionedModels.forEach((model) => {
        const result = getOpenAILLMConfig({
          apiKey: 'test-api-key',
          streaming: true,
          modelOptions: {
            model,
            temperature: 0.7,
            frequency_penalty: 0.5,
            presence_penalty: 0.3,
            topP: 0.9,
          },
        });

        expect(result.llmConfig).toHaveProperty('temperature', 0.7);
        expect(result.llmConfig).toHaveProperty('frequencyPenalty', 0.5);
        expect(result.llmConfig).toHaveProperty('presencePenalty', 0.3);
        expect(result.llmConfig).toHaveProperty('topP', 0.9);
      });
    });

    it('should NOT exclude parameters for gpt-5-chat (it supports sampling params)', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-5-chat',
          temperature: 0.7,
          frequency_penalty: 0.5,
          presence_penalty: 0.3,
          topP: 0.9,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.7);
      expect(result.llmConfig).toHaveProperty('frequencyPenalty', 0.5);
      expect(result.llmConfig).toHaveProperty('presencePenalty', 0.3);
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
    });

    it('should handle reasoning models with reasoning_effort parameter', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        endpoint: EModelEndpoint.openAI,
        modelOptions: {
          model: 'o1',
          reasoning_effort: ReasoningEffort.high,
          temperature: 0.7,
        },
      });

      expect(result.llmConfig).toHaveProperty('reasoning_effort', ReasoningEffort.high);
      expect(result.llmConfig).not.toHaveProperty('temperature');
    });
  });

  describe('OpenAI Web Search Models', () => {
    it('should exclude parameters for gpt-4o search models', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4o-search-preview',
          temperature: 0.7,
          top_p: 0.9,
          seed: 42,
        } as Partial<t.OpenAIParameters>,
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
      expect(result.llmConfig).not.toHaveProperty('top_p');
      expect(result.llmConfig).not.toHaveProperty('seed');
    });

    it('should preserve max_tokens for search models', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4o-search',
          max_tokens: 4096,
          temperature: 0.7,
        },
      });

      expect(result.llmConfig).toHaveProperty('maxTokens', 4096);
      expect(result.llmConfig).not.toHaveProperty('temperature');
    });
  });

  describe('Web Search Functionality', () => {
    it('should enable web search with Responses API', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          web_search: true,
        },
      });

      expect(result.llmConfig).toHaveProperty('useResponsesApi', true);
      expect(result.tools).toContainEqual({ type: 'web_search' });
    });

    it('should handle web search with OpenRouter', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        useOpenRouter: true,
        modelOptions: {
          model: 'gpt-4',
          web_search: true,
        },
      });

      expect(result.llmConfig.modelKwargs).toHaveProperty('plugins', [{ id: 'web' }]);
      expect(result.llmConfig).toHaveProperty('include_reasoning', true);
    });

    it('should disable web search via dropParams', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          web_search: true,
        },
        dropParams: ['web_search'],
      });

      expect(result.tools).not.toContainEqual({ type: 'web_search' });
    });
  });

  describe('GPT-5 max_tokens Handling', () => {
    it('should convert maxTokens to max_completion_tokens for GPT-5 models', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-5',
          max_tokens: 8192,
        },
      });

      expect(result.llmConfig.modelKwargs).toHaveProperty('max_completion_tokens', 8192);
      expect(result.llmConfig).not.toHaveProperty('maxTokens');
    });

    it('should convert maxTokens to max_output_tokens for GPT-5 with Responses API', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-5',
          max_tokens: 8192,
        },
        addParams: {
          useResponsesApi: true,
        },
      });

      expect(result.llmConfig.modelKwargs).toHaveProperty('max_output_tokens', 8192);
      expect(result.llmConfig).not.toHaveProperty('maxTokens');
    });
  });

  describe('Reasoning Parameters', () => {
    it('should handle reasoning_effort for OpenAI endpoint', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        endpoint: EModelEndpoint.openAI,
        modelOptions: {
          model: 'o1',
          reasoning_effort: ReasoningEffort.high,
        },
      });

      expect(result.llmConfig).toHaveProperty('reasoning_effort', ReasoningEffort.high);
    });

    it('should use reasoning object for non-OpenAI endpoints', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        endpoint: 'custom',
        modelOptions: {
          model: 'o1',
          reasoning_effort: ReasoningEffort.high,
          reasoning_summary: ReasoningSummary.concise,
        },
      });

      expect(result.llmConfig).toHaveProperty('reasoning');
      expect(result.llmConfig.reasoning).toEqual({
        effort: ReasoningEffort.high,
        summary: ReasoningSummary.concise,
      });
    });

    it('should use reasoning object when useResponsesApi is true', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        endpoint: EModelEndpoint.openAI,
        modelOptions: {
          model: 'o1',
          reasoning_effort: ReasoningEffort.medium,
          reasoning_summary: ReasoningSummary.detailed,
        },
        addParams: {
          useResponsesApi: true,
        },
      });

      expect(result.llmConfig).toHaveProperty('reasoning');
      expect(result.llmConfig.reasoning).toEqual({
        effort: ReasoningEffort.medium,
        summary: ReasoningSummary.detailed,
      });
    });
  });

  describe('Default and Add Parameters', () => {
    it('should apply default parameters when fields are undefined', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
        },
        defaultParams: {
          temperature: 0.5,
          topP: 0.9,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.5);
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
    });

    it('should NOT override existing values with default parameters', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          temperature: 0.8,
        },
        defaultParams: {
          temperature: 0.5,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.8);
    });

    it('should apply addParams and override defaults', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
        },
        defaultParams: {
          temperature: 0.5,
        },
        addParams: {
          temperature: 0.9,
          seed: 42,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.9);
      expect(result.llmConfig).toHaveProperty('seed', 42);
    });

    it('should handle unknown params via modelKwargs', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
        },
        addParams: {
          custom_param: 'custom_value',
        },
      });

      expect(result.llmConfig.modelKwargs).toHaveProperty('custom_param', 'custom_value');
    });
  });

  describe('Drop Parameters', () => {
    it('should drop specified parameters', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          temperature: 0.7,
          topP: 0.9,
        },
        dropParams: ['temperature'],
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
    });
  });

  describe('OpenRouter Configuration', () => {
    it('should include include_reasoning for OpenRouter', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        useOpenRouter: true,
        modelOptions: {
          model: 'gpt-4',
        },
      });

      expect(result.llmConfig).toHaveProperty('include_reasoning', true);
    });
  });

  describe('Verbosity Handling', () => {
    it('should add verbosity to modelKwargs', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          verbosity: Verbosity.high,
        },
      });

      expect(result.llmConfig.modelKwargs).toHaveProperty('verbosity', Verbosity.high);
    });

    it('should convert verbosity to text object with Responses API', () => {
      const result = getOpenAILLMConfig({
        apiKey: 'test-api-key',
        streaming: true,
        modelOptions: {
          model: 'gpt-4',
          verbosity: Verbosity.low,
        },
        addParams: {
          useResponsesApi: true,
        },
      });

      expect(result.llmConfig.modelKwargs).toHaveProperty('text', { verbosity: Verbosity.low });
      expect(result.llmConfig.modelKwargs).not.toHaveProperty('verbosity');
    });
  });
});

describe('extractDefaultParams', () => {
  it('should extract default values from param definitions', () => {
    const paramDefinitions = [
      { key: 'temperature', default: 0.7 },
      { key: 'maxTokens', default: 4096 },
      { key: 'noDefault' },
    ];

    const result = extractDefaultParams(paramDefinitions);

    expect(result).toEqual({
      temperature: 0.7,
      maxTokens: 4096,
    });
  });

  it('should return undefined for undefined or non-array input', () => {
    expect(extractDefaultParams(undefined)).toBeUndefined();
    expect(extractDefaultParams(null as unknown as undefined)).toBeUndefined();
  });

  it('should handle empty array', () => {
    const result = extractDefaultParams([]);
    expect(result).toEqual({});
  });
});

describe('applyDefaultParams', () => {
  it('should apply defaults only when field is undefined', () => {
    const target: Record<string, unknown> = {
      temperature: 0.8,
      maxTokens: undefined,
    };

    const defaults = {
      temperature: 0.5,
      maxTokens: 4096,
      topP: 0.9,
    };

    applyDefaultParams(target, defaults);

    expect(target).toEqual({
      temperature: 0.8,
      maxTokens: 4096,
      topP: 0.9,
    });
  });
});
