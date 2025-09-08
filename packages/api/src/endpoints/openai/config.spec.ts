import { Verbosity, ReasoningEffort, ReasoningSummary } from 'librechat-data-provider';
import type { RequestInit } from 'undici';
import type { OpenAIParameters, AzureOptions } from '~/types';
import { getOpenAIConfig } from './config';
import { knownOpenAIParams } from './llm';

describe('getOpenAIConfig', () => {
  const mockApiKey = 'test-api-key';

  it('should create basic config with default values', () => {
    const result = getOpenAIConfig(mockApiKey);

    expect(result.llmConfig).toMatchObject({
      streaming: true,
      model: '',
      apiKey: mockApiKey,
    });
    expect(result.configOptions).toEqual({});
    expect(result.tools).toEqual([]);
  });

  it('should apply model options', () => {
    const modelOptions = {
      model: 'gpt-5',
      temperature: 0.7,
      max_tokens: 1000,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect(result.llmConfig).toMatchObject({
      model: 'gpt-5',
      temperature: 0.7,
      modelKwargs: {
        max_completion_tokens: 1000,
      },
    });
    expect((result.llmConfig as Record<string, unknown>).max_tokens).toBeUndefined();
    expect((result.llmConfig as Record<string, unknown>).maxTokens).toBeUndefined();
  });

  it('should separate known and unknown params from addParams', () => {
    const addParams = {
      temperature: 0.5, // known param
      topP: 0.9, // known param
      customParam1: 'value1', // unknown param
      customParam2: { nested: true }, // unknown param
      maxTokens: 500, // known param
    };

    const result = getOpenAIConfig(mockApiKey, { addParams });

    expect(result.llmConfig.temperature).toBe(0.5);
    expect(result.llmConfig.topP).toBe(0.9);
    expect(result.llmConfig.maxTokens).toBe(500);
    expect(result.llmConfig.modelKwargs).toEqual({
      customParam1: 'value1',
      customParam2: { nested: true },
    });
  });

  it('should not add modelKwargs if all params are known', () => {
    const addParams = {
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 500,
    };

    const result = getOpenAIConfig(mockApiKey, { addParams });

    expect(result.llmConfig.modelKwargs).toBeUndefined();
  });

  it('should handle empty addParams', () => {
    const result = getOpenAIConfig(mockApiKey, { addParams: {} });

    expect(result.llmConfig.modelKwargs).toBeUndefined();
  });

  it('should handle reasoning params for `useResponsesApi`', () => {
    const modelOptions = {
      reasoning_effort: ReasoningEffort.high,
      reasoning_summary: ReasoningSummary.detailed,
    };

    const result = getOpenAIConfig(mockApiKey, {
      modelOptions: { ...modelOptions, useResponsesApi: true },
    });

    expect(result.llmConfig.reasoning).toEqual({
      effort: ReasoningEffort.high,
      summary: ReasoningSummary.detailed,
    });
    expect((result.llmConfig as Record<string, unknown>).reasoning_effort).toBeUndefined();
    expect((result.llmConfig as Record<string, unknown>).reasoning_summary).toBeUndefined();
  });

  it('should handle reasoning params without `useResponsesApi`', () => {
    const modelOptions = {
      reasoning_effort: ReasoningEffort.high,
      reasoning_summary: ReasoningSummary.detailed,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect((result.llmConfig as Record<string, unknown>).reasoning_effort).toBe(
      ReasoningEffort.high,
    );
    expect(result.llmConfig.reasoning).toBeUndefined();
  });

  it('should handle OpenRouter configuration', () => {
    const reverseProxyUrl = 'https://openrouter.ai/api/v1';

    const result = getOpenAIConfig(mockApiKey, { reverseProxyUrl });

    expect(result.configOptions?.baseURL).toBe(reverseProxyUrl);
    expect(result.configOptions?.defaultHeaders).toMatchObject({
      'HTTP-Referer': 'https://librechat.ai',
      'X-Title': 'LibreChat',
    });
    expect(result.llmConfig.include_reasoning).toBe(true);
    expect(result.provider).toBe('openrouter');
  });

  it('should handle Azure configuration', () => {
    const azure = {
      azureOpenAIApiInstanceName: 'test-instance',
      azureOpenAIApiDeploymentName: 'test-deployment',
      azureOpenAIApiVersion: '2023-05-15',
      azureOpenAIApiKey: 'azure-key',
    };

    const result = getOpenAIConfig(mockApiKey, { azure });

    expect(result.llmConfig).toMatchObject({
      ...azure,
      model: 'test-deployment',
    });
  });

  it('should handle web search model option', () => {
    const modelOptions = {
      model: 'gpt-5',
      web_search: true,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect(result.llmConfig.useResponsesApi).toBe(true);
    expect(result.tools).toEqual([{ type: 'web_search_preview' }]);
  });

  it('should drop params for search models', () => {
    const modelOptions = {
      model: 'gpt-4o-search',
      temperature: 0.7,
      frequency_penalty: 0.5,
      max_tokens: 1000,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect(result.llmConfig.temperature).toBeUndefined();
    expect((result.llmConfig as Record<string, unknown>).frequency_penalty).toBeUndefined();
    expect(result.llmConfig.maxTokens).toBe(1000); // max_tokens is allowed
  });

  it('should handle custom dropParams', () => {
    const modelOptions = {
      temperature: 0.7,
      topP: 0.9,
      customParam: 'value',
    };

    const result = getOpenAIConfig(mockApiKey, {
      modelOptions,
      dropParams: ['temperature', 'customParam'],
    });

    expect(result.llmConfig.temperature).toBeUndefined();
    expect(result.llmConfig.topP).toBe(0.9);
    expect((result.llmConfig as Record<string, unknown>).customParam).toBeUndefined();
  });

  it('should handle proxy configuration', () => {
    const proxy = 'http://proxy.example.com:8080';

    const result = getOpenAIConfig(mockApiKey, { proxy });

    expect(result.configOptions?.fetchOptions).toBeDefined();
    expect((result.configOptions?.fetchOptions as RequestInit).dispatcher).toBeDefined();
  });

  it('should handle headers and defaultQuery', () => {
    const headers = { 'X-Custom-Header': 'value' };
    const defaultQuery = { customParam: 'value' };

    const result = getOpenAIConfig(mockApiKey, {
      reverseProxyUrl: 'https://api.example.com',
      headers,
      defaultQuery,
    });

    expect(result.configOptions?.baseURL).toBe('https://api.example.com');
    expect(result.configOptions?.defaultHeaders).toEqual(headers);
    expect(result.configOptions?.defaultQuery).toEqual(defaultQuery);
  });

  it('should handle verbosity parameter in modelKwargs', () => {
    const modelOptions = {
      model: 'gpt-5',
      temperature: 0.7,
      verbosity: Verbosity.high,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect(result.llmConfig).toMatchObject({
      model: 'gpt-5',
      temperature: 0.7,
    });
    expect(result.llmConfig.modelKwargs).toEqual({
      verbosity: Verbosity.high,
    });
  });

  it('should allow addParams to override verbosity in modelKwargs', () => {
    const modelOptions = {
      model: 'gpt-5',
      verbosity: Verbosity.low,
    };

    const addParams = {
      temperature: 0.8,
      verbosity: Verbosity.high, // This should override the one from modelOptions
      customParam: 'value',
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions, addParams });

    expect(result.llmConfig.temperature).toBe(0.8);
    expect(result.llmConfig.modelKwargs).toEqual({
      verbosity: Verbosity.high, // Should be overridden by addParams
      customParam: 'value',
    });
  });

  it('should not create modelKwargs if verbosity is empty or null', () => {
    const testCases = [
      { verbosity: null },
      { verbosity: Verbosity.none },
      { verbosity: undefined },
    ];

    testCases.forEach((modelOptions) => {
      const result = getOpenAIConfig(mockApiKey, { modelOptions });
      expect(result.llmConfig.modelKwargs).toBeUndefined();
    });
  });

  it('should nest verbosity under text when useResponsesApi is enabled', () => {
    const modelOptions = {
      model: 'gpt-5',
      temperature: 0.7,
      verbosity: Verbosity.low,
      useResponsesApi: true,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect(result.llmConfig).toMatchObject({
      model: 'gpt-5',
      temperature: 0.7,
      useResponsesApi: true,
    });
    expect(result.llmConfig.modelKwargs).toEqual({
      text: {
        verbosity: Verbosity.low,
      },
    });
  });

  it('should handle verbosity correctly when addParams overrides with useResponsesApi', () => {
    const modelOptions = {
      model: 'gpt-5',
      verbosity: Verbosity.low,
      useResponsesApi: true,
    };

    const addParams = {
      verbosity: Verbosity.high,
      customParam: 'value',
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions, addParams });

    expect(result.llmConfig.modelKwargs).toEqual({
      text: {
        verbosity: Verbosity.high, // Should be overridden by addParams
      },
      customParam: 'value',
    });
  });

  it('should move maxTokens to modelKwargs.max_completion_tokens for GPT-5+ models', () => {
    const modelOptions = {
      model: 'gpt-5',
      temperature: 0.7,
      max_tokens: 2048,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect(result.llmConfig).toMatchObject({
      model: 'gpt-5',
      temperature: 0.7,
    });
    expect(result.llmConfig.maxTokens).toBeUndefined();
    expect(result.llmConfig.modelKwargs).toEqual({
      max_completion_tokens: 2048,
    });
  });

  it('should handle GPT-5+ models with existing modelKwargs', () => {
    const modelOptions = {
      model: 'gpt-6',
      max_tokens: 1000,
      verbosity: Verbosity.low,
    };

    const addParams = {
      customParam: 'value',
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions, addParams });

    expect(result.llmConfig.maxTokens).toBeUndefined();
    expect(result.llmConfig.modelKwargs).toEqual({
      verbosity: Verbosity.low,
      customParam: 'value',
      max_completion_tokens: 1000,
    });
  });

  it('should not move maxTokens for non-GPT-5+ models', () => {
    const modelOptions = {
      model: 'gpt-4',
      temperature: 0.7,
      max_tokens: 2048,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect(result.llmConfig).toMatchObject({
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2048,
    });
    expect(result.llmConfig.modelKwargs).toBeUndefined();
  });

  it('should handle GPT-5+ models with verbosity and useResponsesApi', () => {
    const modelOptions = {
      model: 'gpt-5',
      max_tokens: 1500,
      verbosity: Verbosity.medium,
      useResponsesApi: true,
    };

    const result = getOpenAIConfig(mockApiKey, { modelOptions });

    expect(result.llmConfig.maxTokens).toBeUndefined();
    expect(result.llmConfig.modelKwargs).toEqual({
      text: {
        verbosity: Verbosity.medium,
      },
      max_output_tokens: 1500,
    });
  });

  it('should handle complex addParams with mixed known and unknown params', () => {
    const addParams = {
      // Known params
      model: 'gpt-4-turbo',
      temperature: 0.8,
      topP: 0.95,
      frequencyPenalty: 0.2,
      presencePenalty: 0.1,
      maxTokens: 2048,
      stop: ['\\n\\n', 'END'],
      stream: false,
      // Unknown params
      custom_instruction: 'Be concise',
      response_style: 'formal',
      domain_specific: {
        medical: true,
        terminology: 'advanced',
      },
    };

    const result = getOpenAIConfig(mockApiKey, { addParams });

    // Check known params are in llmConfig
    expect(result.llmConfig).toMatchObject({
      model: 'gpt-4-turbo',
      temperature: 0.8,
      topP: 0.95,
      frequencyPenalty: 0.2,
      presencePenalty: 0.1,
      maxTokens: 2048,
      stop: ['\\n\\n', 'END'],
      stream: false,
    });

    // Check unknown params are in modelKwargs
    expect(result.llmConfig.modelKwargs).toEqual({
      custom_instruction: 'Be concise',
      response_style: 'formal',
      domain_specific: {
        medical: true,
        terminology: 'advanced',
      },
    });
  });

  describe('Azure Configuration', () => {
    it('should handle Azure configuration with model name as deployment', () => {
      const originalEnv = process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME;
      process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = 'true';

      const azure = {
        azureOpenAIApiInstanceName: 'test-instance',
        azureOpenAIApiDeploymentName: 'original-deployment',
        azureOpenAIApiVersion: '2023-05-15',
        azureOpenAIApiKey: 'azure-key',
      };

      const modelOptions = { model: 'gpt-4.0-turbo' };
      const result = getOpenAIConfig(mockApiKey, { azure, modelOptions });

      // Should sanitize model name by removing dots
      expect(result.llmConfig.model).toBe('gpt-40-turbo');
      expect((result.llmConfig as Record<string, unknown>).azureOpenAIApiDeploymentName).toBe(
        'gpt-40-turbo',
      );

      // Cleanup
      if (originalEnv !== undefined) {
        process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = originalEnv;
      } else {
        delete process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME;
      }
    });

    it('should use default Azure deployment name when not using model name', () => {
      const originalEnv = process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME;
      delete process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME;

      const azure = {
        azureOpenAIApiInstanceName: 'test-instance',
        azureOpenAIApiDeploymentName: 'custom-deployment',
        azureOpenAIApiVersion: '2023-05-15',
        azureOpenAIApiKey: 'azure-key',
      };

      const result = getOpenAIConfig(mockApiKey, { azure });

      expect((result.llmConfig as Record<string, unknown>).azureOpenAIApiDeploymentName).toBe(
        'custom-deployment',
      );
      expect(result.llmConfig.model).toBe('custom-deployment');

      // Cleanup
      if (originalEnv !== undefined) {
        process.env.AZURE_USE_MODEL_AS_DEPLOYMENT_NAME = originalEnv;
      }
    });

    it('should handle Azure default model from environment', () => {
      const originalEnv = process.env.AZURE_OPENAI_DEFAULT_MODEL;
      process.env.AZURE_OPENAI_DEFAULT_MODEL = 'gpt-4-env-default';

      const azure = {
        azureOpenAIApiInstanceName: 'test-instance',
        azureOpenAIApiDeploymentName: 'deployment',
        azureOpenAIApiVersion: '2023-05-15',
        azureOpenAIApiKey: 'azure-key',
      };

      const result = getOpenAIConfig(mockApiKey, { azure });

      expect(result.llmConfig.model).toBe('deployment'); // deployment name takes precedence

      // Cleanup
      if (originalEnv !== undefined) {
        process.env.AZURE_OPENAI_DEFAULT_MODEL = originalEnv;
      } else {
        delete process.env.AZURE_OPENAI_DEFAULT_MODEL;
      }
    });

    it('should construct Azure base URL correctly', () => {
      const azure = {
        azureOpenAIApiInstanceName: 'test-instance',
        azureOpenAIApiDeploymentName: 'test-deployment',
        azureOpenAIApiVersion: '2023-05-15',
        azureOpenAIApiKey: 'azure-key',
      };

      const result = getOpenAIConfig(mockApiKey, {
        azure,
        reverseProxyUrl: 'https://${INSTANCE_NAME}.openai.azure.com/openai/v1',
      });

      // The constructAzureURL should replace placeholders with actual values
      expect((result.llmConfig as Record<string, unknown>).azureOpenAIBasePath).toBe(
        'https://test-instance.openai.azure.com/openai/v1',
      );
    });

    it('should handle Azure Responses API configuration', () => {
      const azure = {
        azureOpenAIApiInstanceName: 'test-instance',
        azureOpenAIApiDeploymentName: 'test-deployment',
        azureOpenAIApiVersion: '2023-05-15',
        azureOpenAIApiKey: 'azure-key',
      };

      const modelOptions = { useResponsesApi: true };
      const result = getOpenAIConfig(mockApiKey, { azure, modelOptions });

      // Should construct the responses API URL
      expect(result.configOptions?.baseURL).toContain('test-instance.openai.azure.com');
      expect(result.configOptions?.defaultHeaders).toMatchObject({
        'api-key': mockApiKey,
      });
      expect(result.configOptions?.defaultQuery).toMatchObject({
        'api-version': 'preview',
      });
      expect(result.llmConfig.apiKey).toBe(mockApiKey);
      expect(
        (result.llmConfig as Record<string, unknown>).azureOpenAIApiDeploymentName,
      ).toBeUndefined();
      expect(
        (result.llmConfig as Record<string, unknown>).azureOpenAIApiInstanceName,
      ).toBeUndefined();
    });

    it('should handle Azure with organization from environment', () => {
      const originalOrg = process.env.OPENAI_ORGANIZATION;
      process.env.OPENAI_ORGANIZATION = 'test-org-123';

      const azure = {
        azureOpenAIApiInstanceName: 'test-instance',
        azureOpenAIApiDeploymentName: 'test-deployment',
        azureOpenAIApiVersion: '2023-05-15',
        azureOpenAIApiKey: 'azure-key',
      };

      const result = getOpenAIConfig(mockApiKey, { azure });

      expect(result.configOptions?.organization).toBe('test-org-123');

      // Cleanup
      if (originalOrg !== undefined) {
        process.env.OPENAI_ORGANIZATION = originalOrg;
      } else {
        delete process.env.OPENAI_ORGANIZATION;
      }
    });
  });

  describe('OpenRouter Configuration', () => {
    it('should detect OpenRouter from endpoint parameter', () => {
      const result = getOpenAIConfig(mockApiKey, {}, 'openrouter');

      expect(result.llmConfig.include_reasoning).toBe(true);
      expect(result.provider).toBe('openrouter');
    });

    it('should handle OpenRouter with reasoning params', () => {
      const modelOptions = {
        reasoning_effort: ReasoningEffort.high,
        reasoning_summary: ReasoningSummary.detailed,
      };

      const result = getOpenAIConfig(mockApiKey, {
        reverseProxyUrl: 'https://openrouter.ai/api/v1',
        modelOptions,
      });

      expect(result.llmConfig.reasoning).toEqual({
        effort: ReasoningEffort.high,
        summary: ReasoningSummary.detailed,
      });
      expect(result.provider).toBe('openrouter');
    });

    it('should merge custom headers with OpenRouter defaults', () => {
      const customHeaders = {
        'X-Custom-Header': 'custom-value',
        Authorization: 'Bearer custom-token',
      };

      const result = getOpenAIConfig(mockApiKey, {
        reverseProxyUrl: 'https://openrouter.ai/api/v1',
        headers: customHeaders,
      });

      expect(result.configOptions?.defaultHeaders).toEqual({
        'HTTP-Referer': 'https://librechat.ai',
        'X-Title': 'LibreChat',
        'X-Custom-Header': 'custom-value',
        Authorization: 'Bearer custom-token',
      });
    });
  });

  describe('Direct Endpoint Configuration', () => {
    it('should create custom fetch for direct endpoint', () => {
      const result = getOpenAIConfig(mockApiKey, {
        directEndpoint: true,
        reverseProxyUrl: 'https://direct-api.com',
      });

      // Should have a custom fetch function when directEndpoint is true
      expect(result.configOptions?.fetch).toBeDefined();
      expect(typeof result.configOptions?.fetch).toBe('function');
    });

    it('should not create custom fetch when directEndpoint is false', () => {
      const result = getOpenAIConfig(mockApiKey, {
        directEndpoint: false,
        reverseProxyUrl: 'https://proxy-api.com',
      });

      expect(result.configOptions?.fetch).toBeUndefined();
    });

    it('should not create custom fetch when baseURL is not set', () => {
      const result = getOpenAIConfig(mockApiKey, {
        directEndpoint: true,
      });

      expect(result.configOptions?.fetch).toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null and undefined values in reasoning params', () => {
      const testCases = [
        { reasoning_effort: null, reasoning_summary: null, shouldHaveReasoning: false },
        { reasoning_effort: undefined, reasoning_summary: undefined, shouldHaveReasoning: false },
        { reasoning_effort: '', reasoning_summary: '', shouldHaveReasoning: false },
        {
          reasoning_effort: null,
          reasoning_summary: ReasoningSummary.concise,
          shouldHaveReasoning: true,
        },
        {
          reasoning_effort: ReasoningEffort.low,
          reasoning_summary: null,
          shouldHaveReasoning: true,
        },
      ];

      testCases.forEach(({ shouldHaveReasoning, ...modelOptions }) => {
        const result = getOpenAIConfig(mockApiKey, {
          modelOptions: { ...modelOptions, useResponsesApi: true } as Partial<OpenAIParameters>,
        });

        if (shouldHaveReasoning) {
          expect(result.llmConfig?.reasoning).toBeDefined();
        } else {
          expect(result.llmConfig?.reasoning).toBeUndefined();
        }
      });
    });

    it('should handle empty dropParams array', () => {
      const modelOptions = {
        temperature: 0.7,
        topP: 0.9,
      };

      const result = getOpenAIConfig(mockApiKey, {
        modelOptions,
        dropParams: [],
      });

      expect(result.llmConfig.temperature).toBe(0.7);
      expect(result.llmConfig.topP).toBe(0.9);
    });

    it('should handle non-array dropParams gracefully', () => {
      const modelOptions = {
        temperature: 0.7,
        topP: 0.9,
      };

      const result = getOpenAIConfig(mockApiKey, {
        modelOptions,
        /** Invalid type */
        dropParams: 'temperature' as unknown as string[],
      });

      // Should not crash and should keep all params
      expect(result.llmConfig.temperature).toBe(0.7);
      expect(result.llmConfig.topP).toBe(0.9);
    });

    it('should handle max_tokens conversion edge cases', () => {
      const testCases = [
        { model: 'gpt-4', max_tokens: 1000 }, // Should keep maxTokens
        { model: 'gpt-5', max_tokens: null }, // Should not create modelKwargs
        { model: 'gpt-6', max_tokens: undefined }, // Should not create modelKwargs
        { model: 'gpt-7', max_tokens: 0 }, // Should handle zero
      ];

      testCases.forEach(({ model, max_tokens }) => {
        const result = getOpenAIConfig(mockApiKey, {
          modelOptions: { model, max_tokens: max_tokens ?? undefined },
        });

        if (model === 'gpt-4') {
          expect(result.llmConfig.maxTokens).toBe(1000);
          expect(result.llmConfig.modelKwargs).toBeUndefined();
        } else if (max_tokens != null) {
          expect(result.llmConfig.maxTokens).toBeUndefined();
          expect(result.llmConfig.modelKwargs?.max_completion_tokens).toBe(max_tokens);
        } else {
          expect(result.llmConfig.maxTokens).toBeUndefined();
          expect(result.llmConfig.modelKwargs).toBeUndefined();
        }
      });
    });

    it('should handle various search model patterns', () => {
      const searchModels = [
        'gpt-4o-search',
        'gpt-4o-mini-search',
        'gpt-4o-2024-search',
        'custom-gpt-4o-search-model',
      ];

      searchModels.forEach((model) => {
        const modelOptions = {
          model,
          temperature: 0.7,
          frequency_penalty: 0.5,
          presence_penalty: 0.6,
          max_tokens: 1000,
          custom_param: 'should-remain',
        };

        const result = getOpenAIConfig(mockApiKey, { modelOptions });

        expect(result.llmConfig.temperature).toBeUndefined();
        expect((result.llmConfig as Record<string, unknown>).frequency_penalty).toBeUndefined();
        expect((result.llmConfig as Record<string, unknown>).presence_penalty).toBeUndefined();
        /** `frequency_penalty` is converted to `frequencyPenalty` */
        expect(result.llmConfig.frequencyPenalty).toBe(0.5);
        expect(result.llmConfig.presencePenalty).toBe(0.6);
        /** `presence_penalty` is converted to `presencePenalty` */
        expect(result.llmConfig.maxTokens).toBe(1000); // max_tokens is allowed
        expect((result.llmConfig as Record<string, unknown>).custom_param).toBe('should-remain');
      });
    });

    it('should preserve streaming default when not specified', () => {
      const result = getOpenAIConfig(mockApiKey, {});
      expect(result.llmConfig.streaming).toBe(true);
    });

    it('should override streaming when explicitly set', () => {
      const result = getOpenAIConfig(mockApiKey, { streaming: false });
      expect(result.llmConfig.streaming).toBe(false);
    });
  });

  describe('Parameter Classification', () => {
    it('should correctly identify all known OpenAI parameters', () => {
      const allKnownParams = Array.from(knownOpenAIParams);
      const testParams: Record<string, unknown> = {};

      // Create test object with all known params
      allKnownParams.forEach((param) => {
        testParams[param] = `test-${param}`;
      });

      const result = getOpenAIConfig(mockApiKey, { addParams: testParams });

      // All should be in llmConfig, none in modelKwargs
      expect(result.llmConfig.modelKwargs).toBeUndefined();

      // Check a few key parameters are correctly placed
      expect((result.llmConfig as Record<string, unknown>).model).toBe('test-model');
      expect((result.llmConfig as Record<string, unknown>).temperature).toBe('test-temperature');
      expect((result.llmConfig as Record<string, unknown>).maxTokens).toBe('test-maxTokens');
    });

    it('should handle mixed case and underscore variations', () => {
      const addParams = {
        maxTokens: 1000, // camelCase - known
        topP: 0.9, // camelCase - known
        top_p: 0.8, // snake_case - unknown, should go to modelKwargs
        customParam: 'value', // unknown
      };

      const result = getOpenAIConfig(mockApiKey, { addParams });

      expect(result.llmConfig.maxTokens).toBe(1000);
      expect(result.llmConfig.topP).toBe(0.9);
      expect(result.llmConfig.modelKwargs).toEqual({
        top_p: 0.8,
        customParam: 'value',
      });
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should handle Azure + OpenRouter combination (OpenRouter still detected)', () => {
      const azure = {
        azureOpenAIApiInstanceName: 'test-instance',
        azureOpenAIApiDeploymentName: 'test-deployment',
        azureOpenAIApiVersion: '2023-05-15',
        azureOpenAIApiKey: 'azure-key',
      };

      const result = getOpenAIConfig(mockApiKey, {
        azure,
        reverseProxyUrl: 'https://openrouter.ai/api/v1',
      });

      // Azure config should be present
      expect((result.llmConfig as Record<string, unknown>).azureOpenAIApiInstanceName).toBe(
        'test-instance',
      );
      // But OpenRouter is still detected from URL
      expect(result.provider).toBe('openrouter');
      expect(result.llmConfig.include_reasoning).toBe(true);
    });

    it('should handle all configuration options together', () => {
      const complexConfig = {
        modelOptions: {
          model: 'gpt-4-turbo',
          temperature: 0.7,
          max_tokens: 2000,
          verbosity: Verbosity.medium,
          reasoning_effort: ReasoningEffort.high,
          web_search: true,
        },
        reverseProxyUrl: 'https://api.custom.com',
        headers: { 'X-Custom': 'value' },
        defaultQuery: { version: 'v1' },
        proxy: 'http://proxy.com:8080',
        streaming: false,
        addParams: {
          customParam: 'custom-value',
          temperature: 0.8, // Should override modelOptions
        },
        dropParams: ['frequency_penalty'],
      };

      const result = getOpenAIConfig(mockApiKey, complexConfig);

      expect(result.llmConfig).toMatchObject({
        model: 'gpt-4-turbo',
        temperature: 0.8, // From addParams
        streaming: false,
        useResponsesApi: true, // From web_search
      });
      expect(result.llmConfig.maxTokens).toBe(2000);
      expect(result.llmConfig.modelKwargs).toEqual({
        text: { verbosity: Verbosity.medium },
        customParam: 'custom-value',
      });
      expect(result.tools).toEqual([{ type: 'web_search_preview' }]);
      expect(result.configOptions).toMatchObject({
        baseURL: 'https://api.custom.com',
        defaultHeaders: { 'X-Custom': 'value' },
        defaultQuery: { version: 'v1' },
        fetchOptions: expect.objectContaining({
          dispatcher: expect.any(Object),
        }),
      });
    });
  });

  describe('Real Usage Integration Tests', () => {
    describe('OpenAI Initialize.js Simulation', () => {
      it('should handle OpenAI endpoint configuration like initialize.js', () => {
        // Simulate the configuration from OpenAI initialize.js
        const modelName = 'gpt-4-turbo';
        const endpointOption = {
          model_parameters: {
            temperature: 0.7,
            max_tokens: 2048,
            top_p: 0.9,
            frequency_penalty: 0.1,
            presence_penalty: 0.1,
          },
        };

        // Simulate clientOptions from initialize.js
        const clientOptions = {
          contextStrategy: 'summarize',
          proxy: null,
          debug: false,
          reverseProxyUrl: null,
          streamRate: 30,
          titleModel: 'gpt-3.5-turbo',
          titleMethod: 'completion',
          modelOptions: {
            model: modelName,
            user: 'test-user-id',
            ...endpointOption.model_parameters,
          },
        };

        const result = getOpenAIConfig(mockApiKey, clientOptions);

        expect(result.llmConfig).toMatchObject({
          model: modelName,
          temperature: 0.7,
          maxTokens: 2048,
          // topP is converted from top_p in modelOptions
          frequencyPenalty: 0.1, // converted from frequency_penalty
          presencePenalty: 0.1, // converted from presence_penalty
          user: 'test-user-id',
          streaming: true, // default
          apiKey: mockApiKey,
        });
        expect(result.configOptions).toEqual({});
        expect(result.tools).toEqual([]);
      });

      it('should handle Azure OpenAI configuration like initialize.js', () => {
        // Simulate Azure configuration from mapModelToAzureConfig
        const modelName = 'gpt-4-turbo';
        const azureOptions = {
          azureOpenAIApiKey: 'azure-key-123',
          azureOpenAIApiInstanceName: 'prod-instance',
          azureOpenAIApiDeploymentName: 'gpt-4-turbo-deployment',
          azureOpenAIApiVersion: '2023-12-01-preview',
        };
        const baseURL = 'https://prod-instance.openai.azure.com';
        const headers = {
          'X-Custom-Header': 'azure-value',
          Authorization: 'Bearer custom-token',
        };

        // Simulate clientOptions from Azure initialize.js
        const clientOptions = {
          contextStrategy: null,
          proxy: null,
          debug: false,
          reverseProxyUrl: baseURL,
          headers,
          titleConvo: true,
          titleModel: 'gpt-3.5-turbo',
          streamRate: 30,
          titleMethod: 'completion',
          azure: azureOptions,
          addParams: {
            temperature: 0.8,
            max_completion_tokens: 4000,
          },
          dropParams: ['frequency_penalty'],
          forcePrompt: false,
          modelOptions: {
            model: modelName,
            user: 'azure-user-123',
            temperature: 0.7, // Should be overridden by addParams
            frequency_penalty: 0.2, // Should be dropped
          },
        };

        const result = getOpenAIConfig(mockApiKey, clientOptions);

        expect(result.llmConfig).toMatchObject({
          model: 'gpt-4-turbo-deployment', // Uses deployment name
          temperature: 0.8, // From addParams
          user: 'azure-user-123',
          streaming: true,
          azureOpenAIApiKey: 'azure-key-123',
          azureOpenAIApiInstanceName: 'prod-instance',
          azureOpenAIApiDeploymentName: 'gpt-4-turbo-deployment',
          azureOpenAIApiVersion: '2023-12-01-preview',
        });
        expect((result.llmConfig as Record<string, unknown>).frequency_penalty).toBeUndefined(); // Dropped
        expect(result.llmConfig.modelKwargs).toMatchObject({
          max_completion_tokens: 4000,
        });
        expect(result.configOptions).toMatchObject({
          baseURL: baseURL,
          defaultHeaders: headers,
        });
      });

      it('should handle Azure serverless configuration', () => {
        const modelName = 'gpt-4';
        const azureOptions = {
          azureOpenAIApiKey: 'serverless-key',
          azureOpenAIApiInstanceName: 'serverless-instance',
          azureOpenAIApiDeploymentName: 'gpt-4-serverless',
          azureOpenAIApiVersion: '2024-02-15-preview',
        };

        const clientOptions = {
          reverseProxyUrl: 'https://serverless.openai.azure.com/openai/v1',
          headers: {
            'api-key': azureOptions.azureOpenAIApiKey,
          },
          defaultQuery: {
            'api-version': azureOptions.azureOpenAIApiVersion,
          },
          azure: false as const, // Serverless doesn't use azure object
          modelOptions: {
            model: modelName,
            user: 'serverless-user',
          },
        };

        const result = getOpenAIConfig(azureOptions.azureOpenAIApiKey, clientOptions);

        expect(result.llmConfig).toMatchObject({
          model: modelName,
          user: 'serverless-user',
          apiKey: azureOptions.azureOpenAIApiKey,
        });
        expect(result.configOptions).toMatchObject({
          baseURL: 'https://serverless.openai.azure.com/openai/v1',
          defaultHeaders: {
            'api-key': azureOptions.azureOpenAIApiKey,
          },
          defaultQuery: {
            'api-version': azureOptions.azureOpenAIApiVersion,
          },
        });
      });
    });

    describe('Custom Endpoint Initialize.js Simulation', () => {
      it('should handle custom endpoint configuration like initialize.js', () => {
        const endpoint = 'custom-openai';
        const apiKey = 'custom-api-key-456';
        const baseURL = 'https://api.custom-provider.com/v1';

        // Simulate endpointConfig from custom initialize.js
        const endpointConfig = {
          apiKey: 'user_provided',
          baseURL: baseURL,
          headers: {
            'X-Custom-Provider': 'LibreChat',
            'User-Agent': 'LibreChat/1.0',
          },
          addParams: {
            custom_parameter: 'custom_value',
            temperature: 0.9,
          },
          dropParams: ['presence_penalty'],
          titleConvo: true,
          titleModel: 'gpt-3.5-turbo',
          forcePrompt: false,
          summaryModel: 'gpt-3.5-turbo',
          modelDisplayLabel: 'Custom GPT-4',
          titleMethod: 'completion',
          contextStrategy: 'summarize',
          directEndpoint: true,
          titleMessageRole: 'user',
          streamRate: 25,
        };

        const clientOptions = {
          reverseProxyUrl: baseURL,
          proxy: null,
          headers: endpointConfig.headers,
          addParams: endpointConfig.addParams,
          dropParams: endpointConfig.dropParams,
          customParams: {},
          titleConvo: endpointConfig.titleConvo,
          titleModel: endpointConfig.titleModel,
          forcePrompt: endpointConfig.forcePrompt,
          summaryModel: endpointConfig.summaryModel,
          modelDisplayLabel: endpointConfig.modelDisplayLabel,
          titleMethod: endpointConfig.titleMethod,
          contextStrategy: endpointConfig.contextStrategy,
          directEndpoint: endpointConfig.directEndpoint,
          titleMessageRole: endpointConfig.titleMessageRole,
          streamRate: endpointConfig.streamRate,
          modelOptions: {
            model: 'gpt-4-custom',
            user: 'custom-user-789',
            presence_penalty: 0.3, // Should be dropped
            max_tokens: 3000,
          },
        };

        const result = getOpenAIConfig(apiKey, clientOptions, endpoint);

        expect(result.llmConfig).toMatchObject({
          model: 'gpt-4-custom',
          user: 'custom-user-789',
          temperature: 0.9, // From addParams
          maxTokens: 3000,
          apiKey: apiKey,
        });
        expect((result.llmConfig as Record<string, unknown>).presence_penalty).toBeUndefined(); // Dropped
        expect(result.llmConfig.modelKwargs).toMatchObject({
          custom_parameter: 'custom_value',
        });
        expect(result.configOptions).toMatchObject({
          baseURL: baseURL,
          defaultHeaders: endpointConfig.headers,
          fetch: expect.any(Function), // directEndpoint creates custom fetch
        });
      });

      it('should handle OpenRouter configuration like custom initialize.js', () => {
        const endpoint = 'openrouter';
        const apiKey = 'sk-or-v1-custom-key';
        const baseURL = 'https://openrouter.ai/api/v1';

        const clientOptions = {
          reverseProxyUrl: baseURL,
          headers: {
            'HTTP-Referer': 'https://librechat.ai',
            'X-Title': 'LibreChat',
            Authorization: `Bearer ${apiKey}`,
          },
          addParams: {
            top_k: 50,
            repetition_penalty: 1.1,
          },
          modelOptions: {
            model: 'anthropic/claude-3-sonnet',
            user: 'openrouter-user',
            temperature: 0.7,
            max_tokens: 4000,
            reasoning_effort: ReasoningEffort.high,
            reasoning_summary: ReasoningSummary.detailed,
          },
        };

        const result = getOpenAIConfig(apiKey, clientOptions, endpoint);

        expect(result.llmConfig).toMatchObject({
          model: 'anthropic/claude-3-sonnet',
          user: 'openrouter-user',
          temperature: 0.7,
          maxTokens: 4000,
          include_reasoning: true, // OpenRouter specific
          reasoning: {
            effort: ReasoningEffort.high,
            summary: ReasoningSummary.detailed,
          },
          apiKey: apiKey,
        });
        expect(result.llmConfig.modelKwargs).toMatchObject({
          top_k: 50,
          repetition_penalty: 1.1,
        });
        expect(result.configOptions?.defaultHeaders).toMatchObject({
          'HTTP-Referer': 'https://librechat.ai',
          'X-Title': 'LibreChat',
          Authorization: `Bearer ${apiKey}`,
        });
        expect(result.provider).toBe('openrouter');
      });
    });

    describe('Production-like Azure Scenarios', () => {
      it('should handle complex Azure multi-group configuration', () => {
        // Simulate a production Azure setup with multiple groups
        const modelName = 'gpt-4-turbo';
        const azureConfig = {
          azureOpenAIApiKey: 'prod-key-multi',
          azureOpenAIApiInstanceName: 'prod-east-instance',
          azureOpenAIApiDeploymentName: 'gpt-4-turbo-prod',
          azureOpenAIApiVersion: '2024-02-15-preview',
        };

        const clientOptions = {
          reverseProxyUrl: 'https://prod-east-instance.openai.azure.com',
          headers: {
            'X-Environment': 'production',
            'X-Region': 'us-east-1',
            'Content-Type': 'application/json',
          },
          azure: azureConfig,
          addParams: {
            temperature: 0.2, // Conservative for production
            max_completion_tokens: 8192,
            topP: 0.95, // Use camelCase for known param
            frequencyPenalty: 0.0, // Use camelCase for known param
            presencePenalty: 0.0, // Use camelCase for known param
            seed: 12345, // For reproducibility
          },
          dropParams: [], // Don't drop any params in prod
          modelOptions: {
            model: modelName,
            user: 'prod-user-session-abc123',
            stream: true,
          },
        };

        const result = getOpenAIConfig(mockApiKey, clientOptions);

        expect(result.llmConfig).toMatchObject({
          model: 'gpt-4-turbo-prod',
          user: 'prod-user-session-abc123',
          temperature: 0.2,
          // Parameters from addParams are processed
          seed: 12345,
          stream: true,
          azureOpenAIApiKey: 'prod-key-multi',
          azureOpenAIApiInstanceName: 'prod-east-instance',
          azureOpenAIApiDeploymentName: 'gpt-4-turbo-prod',
          azureOpenAIApiVersion: '2024-02-15-preview',
        });
        // Check that camelCase conversions happened
        expect(result.llmConfig.topP).toBe(0.95);
        expect(result.llmConfig.frequencyPenalty).toBe(0.0);
        expect(result.llmConfig.presencePenalty).toBe(0.0);
        expect(result.llmConfig.modelKwargs).toMatchObject({
          max_completion_tokens: 8192,
        });
        expect(result.configOptions?.baseURL).toBe('https://prod-east-instance.openai.azure.com');
      });

      it('should handle Azure with environment variable placeholders', () => {
        const originalEnv = {
          INSTANCE_NAME: process.env.INSTANCE_NAME,
          DEPLOYMENT_NAME: process.env.DEPLOYMENT_NAME,
          API_VERSION: process.env.API_VERSION,
        };

        // Set environment variables
        process.env.INSTANCE_NAME = 'env-instance';
        process.env.DEPLOYMENT_NAME = 'env-deployment';
        process.env.API_VERSION = '2024-03-01-preview';

        const clientOptions = {
          reverseProxyUrl: 'https://${INSTANCE_NAME}.openai.azure.com/openai/v1',
          azure: {
            azureOpenAIApiKey: 'env-key',
            azureOpenAIApiInstanceName: '${INSTANCE_NAME}',
            azureOpenAIApiDeploymentName: '${DEPLOYMENT_NAME}',
            azureOpenAIApiVersion: '${API_VERSION}',
          },
          modelOptions: {
            model: 'gpt-4',
            user: 'env-user',
          },
        };

        const result = getOpenAIConfig(mockApiKey, clientOptions);

        // The constructAzureURL should process placeholders (actual replacement depends on implementation)
        expect((result.llmConfig as Record<string, unknown>).azureOpenAIBasePath).toBeDefined();
        expect(result.llmConfig.model).toBe('${DEPLOYMENT_NAME}'); // Model becomes deployment name

        // Cleanup
        Object.entries(originalEnv).forEach(([key, value]) => {
          if (value !== undefined) {
            process.env[key] = value;
          } else {
            delete process.env[key];
          }
        });
      });
    });

    describe('Error Handling and Edge Cases from Real Usage', () => {
      it('should handle missing API key scenario', () => {
        expect(() => {
          getOpenAIConfig('', {
            modelOptions: { model: 'gpt-4' },
          });
        }).not.toThrow(); // The function itself doesn't validate empty keys
      });

      it('should handle malformed Azure configuration gracefully', () => {
        const clientOptions = {
          azure: {
            azureOpenAIApiKey: 'valid-key',
            // Missing required fields
          } as Partial<AzureOptions>,
          modelOptions: {
            model: 'gpt-4',
          },
        };

        const result = getOpenAIConfig(mockApiKey, clientOptions);
        expect(result.llmConfig).toBeDefined();
      });

      it('should handle large parameter sets without performance issues', () => {
        const largeAddParams: Record<string, unknown> = {};
        const largeModelKwargs: Record<string, unknown> = {};

        // Create 50 unknown parameters (using names not in knownOpenAIParams)
        for (let i = 0; i < 50; i++) {
          largeAddParams[`unknown_param_${i}`] = 0.5;
        }

        // Create 50 more unknown parameters
        for (let i = 0; i < 50; i++) {
          largeAddParams[`custom_param_${i}`] = `value_${i}`;
          largeModelKwargs[`unknown_param_${i}`] = 0.5;
          largeModelKwargs[`custom_param_${i}`] = `value_${i}`;
        }

        const startTime = Date.now();
        const result = getOpenAIConfig(mockApiKey, {
          addParams: largeAddParams,
          modelOptions: { model: 'gpt-4' },
        });
        const endTime = Date.now();

        expect(endTime - startTime).toBeLessThan(100); // Should be fast
        expect(result.llmConfig.modelKwargs).toEqual(largeModelKwargs);
      });
    });
  });
});
