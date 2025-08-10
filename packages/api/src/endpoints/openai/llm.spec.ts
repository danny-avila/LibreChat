import { ReasoningEffort, ReasoningSummary, Verbosity } from 'librechat-data-provider';
import type { RequestInit } from 'undici';
import { getOpenAIConfig } from './llm';

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

  it('should handle reasoning params for useResponsesApi', () => {
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

  it('should handle reasoning params without useResponsesApi', () => {
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
});
