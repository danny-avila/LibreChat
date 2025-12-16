const { EModelEndpoint } = require('librechat-data-provider');
const {
  maxTokensMap,
  matchModelName,
  processModelData,
  getModelMaxTokens,
  maxOutputTokensMap,
  findMatchingPattern,
} = require('@librechat/api');

describe('getModelMaxTokens', () => {
  test('should return correct tokens for exact match', () => {
    expect(getModelMaxTokens('gpt-4-32k-0613')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-32k-0613'],
    );
  });

  test('should return correct tokens for partial match', () => {
    expect(getModelMaxTokens('gpt-4-32k-unknown')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-32k'],
    );
  });

  test('should return correct tokens for partial match (OpenRouter)', () => {
    expect(getModelMaxTokens('openai/gpt-4-32k')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-32k'],
    );
  });

  test('should return undefined for no match', () => {
    expect(getModelMaxTokens('unknown-model')).toBeUndefined();
  });

  test('should return correct tokens for another exact match', () => {
    expect(getModelMaxTokens('gpt-3.5-turbo-16k-0613')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-3.5-turbo-16k-0613'],
    );
  });

  test('should return correct tokens for another partial match', () => {
    expect(getModelMaxTokens('gpt-3.5-turbo-unknown')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-3.5-turbo'],
    );
  });

  test('should return undefined for undefined input', () => {
    expect(getModelMaxTokens(undefined)).toBeUndefined();
  });

  test('should return undefined for null input', () => {
    expect(getModelMaxTokens(null)).toBeUndefined();
  });

  test('should return undefined for number input', () => {
    expect(getModelMaxTokens(123)).toBeUndefined();
  });

  // 11/06 Update
  test('should return correct tokens for gpt-3.5-turbo-1106 exact match', () => {
    expect(getModelMaxTokens('gpt-3.5-turbo-1106')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-3.5-turbo-1106'],
    );
  });

  test('should return correct tokens for gpt-4-1106 exact match', () => {
    expect(getModelMaxTokens('gpt-4-1106')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-4-1106']);
  });

  test('should return correct tokens for gpt-4-vision exact match', () => {
    expect(getModelMaxTokens('gpt-4-vision')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-vision'],
    );
  });

  test('should return correct tokens for gpt-3.5-turbo-1106 partial match', () => {
    expect(getModelMaxTokens('something-/gpt-3.5-turbo-1106')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-3.5-turbo-1106'],
    );
    expect(getModelMaxTokens('gpt-3.5-turbo-1106/something-/')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-3.5-turbo-1106'],
    );
  });

  test('should return correct tokens for gpt-4-1106 partial match', () => {
    expect(getModelMaxTokens('gpt-4-1106/something')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-1106'],
    );
    expect(getModelMaxTokens('gpt-4-1106-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-1106'],
    );
    expect(getModelMaxTokens('gpt-4-1106-vision-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-1106'],
    );
  });

  // 01/25 Update
  test('should return correct tokens for gpt-4-turbo/0125 matches', () => {
    expect(getModelMaxTokens('gpt-4-turbo')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-turbo'],
    );
    expect(getModelMaxTokens('gpt-4-turbo-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-turbo'],
    );
    expect(getModelMaxTokens('gpt-4-0125')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-4-0125']);
    expect(getModelMaxTokens('gpt-4-0125-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4-0125'],
    );
    expect(getModelMaxTokens('gpt-3.5-turbo-0125')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-3.5-turbo-0125'],
    );
  });

  test('should return correct tokens for gpt-4.5 matches', () => {
    expect(getModelMaxTokens('gpt-4.5')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-4.5']);
    expect(getModelMaxTokens('gpt-4.5-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.5'],
    );
    expect(getModelMaxTokens('openai/gpt-4.5-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.5'],
    );
  });

  test('should return correct tokens for gpt-4.1 matches', () => {
    expect(getModelMaxTokens('gpt-4.1')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-4.1']);
    expect(getModelMaxTokens('gpt-4.1-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1'],
    );
    expect(getModelMaxTokens('openai/gpt-4.1')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1'],
    );
    expect(getModelMaxTokens('gpt-4.1-2024-08-06')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1'],
    );
  });

  test('should return correct tokens for gpt-4.1-mini matches', () => {
    expect(getModelMaxTokens('gpt-4.1-mini')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1-mini'],
    );
    expect(getModelMaxTokens('gpt-4.1-mini-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1-mini'],
    );
    expect(getModelMaxTokens('openai/gpt-4.1-mini')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1-mini'],
    );
  });

  test('should return correct tokens for gpt-4.1-nano matches', () => {
    expect(getModelMaxTokens('gpt-4.1-nano')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1-nano'],
    );
    expect(getModelMaxTokens('gpt-4.1-nano-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1-nano'],
    );
    expect(getModelMaxTokens('openai/gpt-4.1-nano')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-4.1-nano'],
    );
  });

  test('should return correct tokens for gpt-5 matches', () => {
    expect(getModelMaxTokens('gpt-5')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-5']);
    expect(getModelMaxTokens('gpt-5-preview')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-5']);
    expect(getModelMaxTokens('openai/gpt-5')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-5']);
    expect(getModelMaxTokens('gpt-5-2025-01-30')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-5'],
    );
  });

  test('should return correct tokens for gpt-5-mini matches', () => {
    expect(getModelMaxTokens('gpt-5-mini')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-5-mini']);
    expect(getModelMaxTokens('gpt-5-mini-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-5-mini'],
    );
    expect(getModelMaxTokens('openai/gpt-5-mini')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-5-mini'],
    );
  });

  test('should return correct tokens for gpt-5-nano matches', () => {
    expect(getModelMaxTokens('gpt-5-nano')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-5-nano']);
    expect(getModelMaxTokens('gpt-5-nano-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-5-nano'],
    );
    expect(getModelMaxTokens('openai/gpt-5-nano')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-5-nano'],
    );
  });

  test('should return correct tokens for gpt-5-pro matches', () => {
    expect(getModelMaxTokens('gpt-5-pro')).toBe(maxTokensMap[EModelEndpoint.openAI]['gpt-5-pro']);
    expect(getModelMaxTokens('gpt-5-pro-preview')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-5-pro'],
    );
    expect(getModelMaxTokens('openai/gpt-5-pro')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-5-pro'],
    );
    expect(getModelMaxTokens('gpt-5-pro-2025-01-30')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['gpt-5-pro'],
    );
  });

  test('should return correct tokens for Anthropic models', () => {
    const models = [
      'claude-2.1',
      'claude-2',
      'claude-1.2',
      'claude-1',
      'claude-1-100k',
      'claude-instant-1',
      'claude-instant-1-100k',
      'claude-3-haiku',
      'claude-3-sonnet',
      'claude-3-opus',
      'claude-3-5-sonnet',
      'claude-3-7-sonnet',
    ];

    const maxTokens = {
      'claude-': maxTokensMap[EModelEndpoint.anthropic]['claude-'],
      'claude-2.1': maxTokensMap[EModelEndpoint.anthropic]['claude-2.1'],
      'claude-3': maxTokensMap[EModelEndpoint.anthropic]['claude-3-sonnet'],
    };

    models.forEach((model) => {
      let expectedTokens;

      if (model === 'claude-2.1') {
        expectedTokens = maxTokens['claude-2.1'];
      } else if (model.startsWith('claude-3')) {
        expectedTokens = maxTokens['claude-3'];
      } else {
        expectedTokens = maxTokens['claude-'];
      }

      expect(getModelMaxTokens(model, EModelEndpoint.anthropic)).toEqual(expectedTokens);
    });
  });

  // Tests for Google models
  test('should return correct tokens for exact match - Google models', () => {
    expect(getModelMaxTokens('text-bison-32k', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['text-bison-32k'],
    );
    expect(getModelMaxTokens('codechat-bison-32k', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['codechat-bison-32k'],
    );
  });

  test('should return undefined for no match - Google models', () => {
    expect(getModelMaxTokens('unknown-google-model', EModelEndpoint.google)).toBeUndefined();
  });

  test('should return correct tokens for partial match - Google models', () => {
    expect(getModelMaxTokens('gemini-2.0-flash-lite-preview-02-05', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-2.0-flash-lite'],
    );
    expect(getModelMaxTokens('gemini-2.0-flash-001', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-2.0-flash'],
    );
    expect(getModelMaxTokens('gemini-2.0-flash-exp', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-2.0-flash'],
    );
    expect(getModelMaxTokens('gemini-2.0-pro-exp-02-05', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-2.0'],
    );
    expect(getModelMaxTokens('gemini-1.5-flash-8b', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-1.5-flash-8b'],
    );
    expect(getModelMaxTokens('gemini-1.5-flash-thinking', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-1.5-flash'],
    );
    expect(getModelMaxTokens('gemini-1.5-pro-latest', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-1.5'],
    );
    expect(getModelMaxTokens('gemini-1.5-pro-preview-0409', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-1.5'],
    );
    expect(getModelMaxTokens('gemini-3', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-3'],
    );
    expect(getModelMaxTokens('gemini-2.5-pro', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-2.5-pro'],
    );
    expect(getModelMaxTokens('gemini-2.5-flash', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-2.5-flash'],
    );
    expect(getModelMaxTokens('gemini-2.5-flash-lite', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-2.5-flash-lite'],
    );
    expect(getModelMaxTokens('gemini-pro-vision', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-pro-vision'],
    );
    expect(getModelMaxTokens('gemini-1.0', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini'],
    );
    expect(getModelMaxTokens('gemini-pro', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini'],
    );
    expect(getModelMaxTokens('code-', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['code-'],
    );
    expect(getModelMaxTokens('chat-', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['chat-'],
    );
  });

  test('should return correct tokens for partial match - Cohere models', () => {
    expect(getModelMaxTokens('command', EModelEndpoint.custom)).toBe(
      maxTokensMap[EModelEndpoint.custom]['command'],
    );
    expect(getModelMaxTokens('command-r-plus', EModelEndpoint.custom)).toBe(
      maxTokensMap[EModelEndpoint.custom]['command-r-plus'],
    );
  });

  test('should return correct tokens when using a custom endpointTokenConfig', () => {
    const customTokenConfig = {
      'custom-model': 12345,
    };
    expect(getModelMaxTokens('custom-model', EModelEndpoint.openAI, customTokenConfig)).toBe(12345);
  });

  test('should prioritize endpointTokenConfig over the default configuration', () => {
    const customTokenConfig = {
      'gpt-4-32k': 9999,
    };
    expect(getModelMaxTokens('gpt-4-32k', EModelEndpoint.openAI, customTokenConfig)).toBe(9999);
  });

  test('should return undefined if the model is not found in custom endpointTokenConfig', () => {
    const customTokenConfig = {
      'custom-model': 12345,
    };
    expect(
      getModelMaxTokens('nonexistent-model', EModelEndpoint.openAI, customTokenConfig),
    ).toBeUndefined();
  });

  test('should return correct tokens for exact match in azureOpenAI models', () => {
    expect(getModelMaxTokens('gpt-4-turbo', EModelEndpoint.azureOpenAI)).toBe(
      maxTokensMap[EModelEndpoint.azureOpenAI]['gpt-4-turbo'],
    );
  });

  test('should return undefined for no match in azureOpenAI models', () => {
    expect(
      getModelMaxTokens('nonexistent-azure-model', EModelEndpoint.azureOpenAI),
    ).toBeUndefined();
  });

  test('should return undefined for undefined, null, or number model argument with azureOpenAI endpoint', () => {
    expect(getModelMaxTokens(undefined, EModelEndpoint.azureOpenAI)).toBeUndefined();
    expect(getModelMaxTokens(null, EModelEndpoint.azureOpenAI)).toBeUndefined();
    expect(getModelMaxTokens(1234, EModelEndpoint.azureOpenAI)).toBeUndefined();
  });

  test('should respect custom endpointTokenConfig over azureOpenAI defaults', () => {
    const customTokenConfig = {
      'custom-azure-model': 4096,
    };
    expect(
      getModelMaxTokens('custom-azure-model', EModelEndpoint.azureOpenAI, customTokenConfig),
    ).toBe(4096);
  });

  test('should return correct tokens for partial match with custom endpointTokenConfig in azureOpenAI', () => {
    const customTokenConfig = {
      'azure-custom-': 1024,
    };
    expect(
      getModelMaxTokens('azure-custom-gpt-3', EModelEndpoint.azureOpenAI, customTokenConfig),
    ).toBe(1024);
  });

  test('should return undefined for a model when using an unsupported endpoint', () => {
    expect(getModelMaxTokens('azure-gpt-3', 'unsupportedEndpoint')).toBeUndefined();
  });

  test('should return correct max context tokens for o1-series models', () => {
    // Standard o1 variations
    const o1Tokens = maxTokensMap[EModelEndpoint.openAI]['o1'];
    expect(getModelMaxTokens('o1')).toBe(o1Tokens);
    expect(getModelMaxTokens('o1-latest')).toBe(o1Tokens);
    expect(getModelMaxTokens('o1-2024-12-17')).toBe(o1Tokens);
    expect(getModelMaxTokens('o1-something-else')).toBe(o1Tokens);
    expect(getModelMaxTokens('openai/o1-something-else')).toBe(o1Tokens);

    // Mini variations
    const o1MiniTokens = maxTokensMap[EModelEndpoint.openAI]['o1-mini'];
    expect(getModelMaxTokens('o1-mini')).toBe(o1MiniTokens);
    expect(getModelMaxTokens('o1-mini-latest')).toBe(o1MiniTokens);
    expect(getModelMaxTokens('o1-mini-2024-09-12')).toBe(o1MiniTokens);
    expect(getModelMaxTokens('o1-mini-something')).toBe(o1MiniTokens);
    expect(getModelMaxTokens('openai/o1-mini-something')).toBe(o1MiniTokens);

    // Preview variations
    const o1PreviewTokens = maxTokensMap[EModelEndpoint.openAI]['o1-preview'];
    expect(getModelMaxTokens('o1-preview')).toBe(o1PreviewTokens);
    expect(getModelMaxTokens('o1-preview-latest')).toBe(o1PreviewTokens);
    expect(getModelMaxTokens('o1-preview-2024-09-12')).toBe(o1PreviewTokens);
    expect(getModelMaxTokens('o1-preview-something')).toBe(o1PreviewTokens);
    expect(getModelMaxTokens('openai/o1-preview-something')).toBe(o1PreviewTokens);
  });

  test('should return correct max context tokens for o4-mini and o3', () => {
    const o4MiniTokens = maxTokensMap[EModelEndpoint.openAI]['o4-mini'];
    const o3Tokens = maxTokensMap[EModelEndpoint.openAI]['o3'];
    expect(getModelMaxTokens('o4-mini')).toBe(o4MiniTokens);
    expect(getModelMaxTokens('openai/o4-mini')).toBe(o4MiniTokens);
    expect(getModelMaxTokens('o3')).toBe(o3Tokens);
    expect(getModelMaxTokens('openai/o3')).toBe(o3Tokens);
  });

  test('should return correct tokens for GPT-OSS models', () => {
    const expected = maxTokensMap[EModelEndpoint.openAI]['gpt-oss'];
    [
      'gpt-oss:20b',
      'gpt-oss-20b',
      'gpt-oss-120b',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss:120b',
    ].forEach((name) => {
      expect(getModelMaxTokens(name)).toBe(expected);
    });
  });

  test('should return correct tokens for GLM models', () => {
    expect(getModelMaxTokens('glm-4.6')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4.6']);
    expect(getModelMaxTokens('glm-4.5v')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4.5v']);
    expect(getModelMaxTokens('glm-4.5-air')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.5-air'],
    );
    expect(getModelMaxTokens('glm-4.5')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4.5']);
    expect(getModelMaxTokens('glm-4-32b')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4-32b']);
    expect(getModelMaxTokens('glm-4')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4']);
    expect(getModelMaxTokens('glm4')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm4']);
  });

  test('should return correct tokens for GLM models with provider prefixes', () => {
    expect(getModelMaxTokens('z-ai/glm-4.6')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4.6']);
    expect(getModelMaxTokens('z-ai/glm-4.5')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4.5']);
    expect(getModelMaxTokens('z-ai/glm-4.5-air')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.5-air'],
    );
    expect(getModelMaxTokens('z-ai/glm-4.5v')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.5v'],
    );
    expect(getModelMaxTokens('z-ai/glm-4-32b')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4-32b'],
    );

    expect(getModelMaxTokens('zai/glm-4.6')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4.6']);
    expect(getModelMaxTokens('zai/glm-4.5-air')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.5-air'],
    );
    expect(getModelMaxTokens('zai/glm-4.5v')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4.5v']);

    expect(getModelMaxTokens('zai-org/GLM-4.6')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.6'],
    );
    expect(getModelMaxTokens('zai-org/GLM-4.5')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.5'],
    );
    expect(getModelMaxTokens('zai-org/GLM-4.5-Air')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.5-air'],
    );
    expect(getModelMaxTokens('zai-org/GLM-4.5V')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.5v'],
    );
    expect(getModelMaxTokens('zai-org/GLM-4-32B-0414')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4-32b'],
    );
  });

  test('should return correct tokens for GLM models with suffixes', () => {
    expect(getModelMaxTokens('glm-4.6-fp8')).toBe(maxTokensMap[EModelEndpoint.openAI]['glm-4.6']);
    expect(getModelMaxTokens('zai-org/GLM-4.6-FP8')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.6'],
    );
    expect(getModelMaxTokens('zai-org/GLM-4.5-Air-FP8')).toBe(
      maxTokensMap[EModelEndpoint.openAI]['glm-4.5-air'],
    );
  });

  test('should return correct max output tokens for GPT-5 models', () => {
    const { getModelMaxOutputTokens } = require('@librechat/api');
    ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-pro'].forEach((model) => {
      expect(getModelMaxOutputTokens(model)).toBe(maxOutputTokensMap[EModelEndpoint.openAI][model]);
      expect(getModelMaxOutputTokens(model, EModelEndpoint.openAI)).toBe(
        maxOutputTokensMap[EModelEndpoint.openAI][model],
      );
      expect(getModelMaxOutputTokens(model, EModelEndpoint.azureOpenAI)).toBe(
        maxOutputTokensMap[EModelEndpoint.azureOpenAI][model],
      );
    });
  });

  test('should return correct max output tokens for GPT-OSS models', () => {
    const { getModelMaxOutputTokens } = require('@librechat/api');
    ['gpt-oss-20b', 'gpt-oss-120b'].forEach((model) => {
      expect(getModelMaxOutputTokens(model)).toBe(maxOutputTokensMap[EModelEndpoint.openAI][model]);
      expect(getModelMaxOutputTokens(model, EModelEndpoint.openAI)).toBe(
        maxOutputTokensMap[EModelEndpoint.openAI][model],
      );
      expect(getModelMaxOutputTokens(model, EModelEndpoint.azureOpenAI)).toBe(
        maxOutputTokensMap[EModelEndpoint.azureOpenAI][model],
      );
    });
  });
});

describe('matchModelName', () => {
  it('should return the exact model name if it exists in maxTokensMap', () => {
    expect(matchModelName('gpt-4-32k-0613')).toBe('gpt-4-32k-0613');
  });

  it('should return the closest matching key for partial matches', () => {
    expect(matchModelName('gpt-4-32k-unknown')).toBe('gpt-4-32k');
  });

  it('should return the input model name if no match is found', () => {
    expect(matchModelName('unknown-model')).toBe('unknown-model');
  });

  it('should return undefined for non-string inputs', () => {
    expect(matchModelName(undefined)).toBeUndefined();
    expect(matchModelName(null)).toBeUndefined();
    expect(matchModelName(123)).toBeUndefined();
    expect(matchModelName({})).toBeUndefined();
  });

  // 11/06 Update
  it('should return the exact model name for gpt-3.5-turbo-1106 if it exists in maxTokensMap', () => {
    expect(matchModelName('gpt-3.5-turbo-1106')).toBe('gpt-3.5-turbo-1106');
  });

  it('should return the exact model name for gpt-4-1106 if it exists in maxTokensMap', () => {
    expect(matchModelName('gpt-4-1106')).toBe('gpt-4-1106');
  });

  it('should return the closest matching key for gpt-3.5-turbo-1106 partial matches', () => {
    expect(matchModelName('gpt-3.5-turbo-1106/something')).toBe('gpt-3.5-turbo-1106');
    expect(matchModelName('something/gpt-3.5-turbo-1106')).toBe('gpt-3.5-turbo-1106');
  });

  it('should return the closest matching key for gpt-4-1106 partial matches', () => {
    expect(matchModelName('gpt-4-1106/something')).toBe('gpt-4-1106');
    expect(matchModelName('gpt-4-1106-preview')).toBe('gpt-4-1106');
    expect(matchModelName('gpt-4-1106-vision-preview')).toBe('gpt-4-1106');
  });

  // 01/25 Update
  it('should return the closest matching key for gpt-4-turbo/0125 matches', () => {
    expect(matchModelName('openai/gpt-4-0125')).toBe('gpt-4-0125');
    expect(matchModelName('gpt-4-turbo-preview')).toBe('gpt-4-turbo');
    expect(matchModelName('gpt-4-turbo-vision-preview')).toBe('gpt-4-turbo');
    expect(matchModelName('gpt-4-0125')).toBe('gpt-4-0125');
    expect(matchModelName('gpt-4-0125-preview')).toBe('gpt-4-0125');
    expect(matchModelName('gpt-4-0125-vision-preview')).toBe('gpt-4-0125');
  });

  it('should return the closest matching key for gpt-4.1 matches', () => {
    expect(matchModelName('openai/gpt-4.1')).toBe('gpt-4.1');
    expect(matchModelName('gpt-4.1-preview')).toBe('gpt-4.1');
    expect(matchModelName('gpt-4.1-2024-08-06')).toBe('gpt-4.1');
    expect(matchModelName('gpt-4.1-2024-08-06-0718')).toBe('gpt-4.1');
  });

  it('should return the closest matching key for gpt-4.1-mini matches', () => {
    expect(matchModelName('openai/gpt-4.1-mini')).toBe('gpt-4.1-mini');
    expect(matchModelName('gpt-4.1-mini-preview')).toBe('gpt-4.1-mini');
    expect(matchModelName('gpt-4.1-mini-2024-08-06')).toBe('gpt-4.1-mini');
  });

  it('should return the closest matching key for gpt-4.1-nano matches', () => {
    expect(matchModelName('openai/gpt-4.1-nano')).toBe('gpt-4.1-nano');
    expect(matchModelName('gpt-4.1-nano-preview')).toBe('gpt-4.1-nano');
    expect(matchModelName('gpt-4.1-nano-2024-08-06')).toBe('gpt-4.1-nano');
  });

  it('should return the closest matching key for gpt-5 matches', () => {
    expect(matchModelName('openai/gpt-5')).toBe('gpt-5');
    expect(matchModelName('gpt-5-preview')).toBe('gpt-5');
    expect(matchModelName('gpt-5-2025-01-30')).toBe('gpt-5');
    expect(matchModelName('gpt-5-2025-01-30-0130')).toBe('gpt-5');
  });

  it('should return the closest matching key for gpt-5-mini matches', () => {
    expect(matchModelName('openai/gpt-5-mini')).toBe('gpt-5-mini');
    expect(matchModelName('gpt-5-mini-preview')).toBe('gpt-5-mini');
    expect(matchModelName('gpt-5-mini-2025-01-30')).toBe('gpt-5-mini');
  });

  it('should return the closest matching key for gpt-5-nano matches', () => {
    expect(matchModelName('openai/gpt-5-nano')).toBe('gpt-5-nano');
    expect(matchModelName('gpt-5-nano-preview')).toBe('gpt-5-nano');
    expect(matchModelName('gpt-5-nano-2025-01-30')).toBe('gpt-5-nano');
  });

  it('should return the closest matching key for gpt-5-pro matches', () => {
    expect(matchModelName('openai/gpt-5-pro')).toBe('gpt-5-pro');
    expect(matchModelName('gpt-5-pro-preview')).toBe('gpt-5-pro');
    expect(matchModelName('gpt-5-pro-2025-01-30')).toBe('gpt-5-pro');
    expect(matchModelName('gpt-5-pro-2025-01-30-0130')).toBe('gpt-5-pro');
  });

  // Tests for Google models
  it('should return the exact model name if it exists in maxTokensMap - Google models', () => {
    expect(matchModelName('text-bison-32k', EModelEndpoint.google)).toBe('text-bison-32k');
    expect(matchModelName('codechat-bison-32k', EModelEndpoint.google)).toBe('codechat-bison-32k');
  });

  it('should return the input model name if no match is found - Google models', () => {
    expect(matchModelName('unknown-google-model', EModelEndpoint.google)).toBe(
      'unknown-google-model',
    );
  });

  it('should return the closest matching key for partial matches - Google models', () => {
    expect(matchModelName('code-', EModelEndpoint.google)).toBe('code-');
    expect(matchModelName('chat-', EModelEndpoint.google)).toBe('chat-');
  });
});

describe('Meta Models Tests', () => {
  describe('getModelMaxTokens', () => {
    test('should return correct tokens for LLaMa 2 models', () => {
      expect(getModelMaxTokens('llama2')).toBe(4000);
      expect(getModelMaxTokens('llama2.70b')).toBe(4000);
      expect(getModelMaxTokens('llama2-13b')).toBe(4000);
      expect(getModelMaxTokens('llama2-70b')).toBe(4000);
    });

    test('should return correct tokens for LLaMa 3 models', () => {
      expect(getModelMaxTokens('llama3')).toBe(8000);
      expect(getModelMaxTokens('llama3.8b')).toBe(8000);
      expect(getModelMaxTokens('llama3.70b')).toBe(8000);
      expect(getModelMaxTokens('llama3-8b')).toBe(8000);
      expect(getModelMaxTokens('llama3-70b')).toBe(8000);
    });

    test('should return correct tokens for LLaMa 3.1 models', () => {
      expect(getModelMaxTokens('llama3.1:8b')).toBe(127500);
      expect(getModelMaxTokens('llama3.1:70b')).toBe(127500);
      expect(getModelMaxTokens('llama3.1:405b')).toBe(127500);
      expect(getModelMaxTokens('llama3-1-8b')).toBe(127500);
      expect(getModelMaxTokens('llama3-1-70b')).toBe(127500);
      expect(getModelMaxTokens('llama3-1-405b')).toBe(127500);
    });

    test('should handle partial matches for Meta models', () => {
      // Test with full model names
      expect(getModelMaxTokens('meta/llama3.1:405b')).toBe(127500);
      expect(getModelMaxTokens('meta/llama3.1:70b')).toBe(127500);
      expect(getModelMaxTokens('meta/llama3.1:8b')).toBe(127500);
      expect(getModelMaxTokens('meta/llama3-1-8b')).toBe(127500);

      // Test base versions
      expect(getModelMaxTokens('meta/llama3.1')).toBe(127500);
      expect(getModelMaxTokens('meta/llama3-1')).toBe(127500);
      expect(getModelMaxTokens('meta/llama3')).toBe(8000);
      expect(getModelMaxTokens('meta/llama2')).toBe(4000);
    });

    test('should match Deepseek model variations', () => {
      expect(getModelMaxTokens('deepseek-chat')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['deepseek-chat'],
      );
      expect(getModelMaxTokens('deepseek-coder')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['deepseek'],
      );
      expect(getModelMaxTokens('deepseek-reasoner')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['deepseek-reasoner'],
      );
      expect(getModelMaxTokens('deepseek.r1')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['deepseek.r1'],
      );
    });

    test('should return 128000 context tokens for all DeepSeek models', () => {
      expect(getModelMaxTokens('deepseek-chat')).toBe(128000);
      expect(getModelMaxTokens('deepseek-reasoner')).toBe(128000);
      expect(getModelMaxTokens('deepseek-r1')).toBe(128000);
      expect(getModelMaxTokens('deepseek-v3')).toBe(128000);
      expect(getModelMaxTokens('deepseek.r1')).toBe(128000);
    });

    test('should handle DeepSeek models with provider prefixes', () => {
      expect(getModelMaxTokens('deepseek/deepseek-chat')).toBe(128000);
      expect(getModelMaxTokens('openrouter/deepseek-reasoner')).toBe(128000);
      expect(getModelMaxTokens('openai/deepseek-v3')).toBe(128000);
    });
  });

  describe('matchModelName', () => {
    test('should match exact LLaMa model names', () => {
      expect(matchModelName('llama2')).toBe('llama2');
      expect(matchModelName('llama3')).toBe('llama3');
      expect(matchModelName('llama3.1:8b')).toBe('llama3.1:8b');
    });

    test('should match LLaMa model variations', () => {
      // Test full model names
      expect(matchModelName('meta/llama3.1:405b')).toBe('llama3.1:405b');
      expect(matchModelName('meta/llama3.1:70b')).toBe('llama3.1:70b');
      expect(matchModelName('meta/llama3.1:8b')).toBe('llama3.1:8b');
      expect(matchModelName('meta/llama3-1-8b')).toBe('llama3-1-8b');

      // Test base versions
      expect(matchModelName('meta/llama3.1')).toBe('llama3.1');
      expect(matchModelName('meta/llama3-1')).toBe('llama3-1');
    });

    test('should handle custom endpoint for Meta models', () => {
      expect(matchModelName('llama2', EModelEndpoint.bedrock)).toBe('llama2');
      expect(matchModelName('llama3', EModelEndpoint.bedrock)).toBe('llama3');
      expect(matchModelName('llama3.1:8b', EModelEndpoint.bedrock)).toBe('llama3.1:8b');
    });

    test('should match Deepseek model variations', () => {
      expect(matchModelName('deepseek-chat')).toBe('deepseek-chat');
      expect(matchModelName('deepseek-coder')).toBe('deepseek');
    });
  });

  describe('DeepSeek Max Output Tokens', () => {
    const { getModelMaxOutputTokens } = require('@librechat/api');

    test('should return correct max output tokens for deepseek-chat', () => {
      expect(getModelMaxOutputTokens('deepseek-chat')).toBe(8000);
      expect(getModelMaxOutputTokens('deepseek-chat', EModelEndpoint.openAI)).toBe(8000);
      expect(getModelMaxOutputTokens('deepseek-chat', EModelEndpoint.custom)).toBe(8000);
    });

    test('should return correct max output tokens for deepseek-reasoner', () => {
      expect(getModelMaxOutputTokens('deepseek-reasoner')).toBe(64000);
      expect(getModelMaxOutputTokens('deepseek-reasoner', EModelEndpoint.openAI)).toBe(64000);
      expect(getModelMaxOutputTokens('deepseek-reasoner', EModelEndpoint.custom)).toBe(64000);
    });

    test('should return correct max output tokens for deepseek-r1', () => {
      expect(getModelMaxOutputTokens('deepseek-r1')).toBe(64000);
      expect(getModelMaxOutputTokens('deepseek-r1', EModelEndpoint.openAI)).toBe(64000);
    });

    test('should return correct max output tokens for deepseek base pattern', () => {
      expect(getModelMaxOutputTokens('deepseek')).toBe(8000);
      expect(getModelMaxOutputTokens('deepseek-v3')).toBe(8000);
    });

    test('should handle DeepSeek models with provider prefixes for max output tokens', () => {
      expect(getModelMaxOutputTokens('deepseek/deepseek-chat')).toBe(8000);
      expect(getModelMaxOutputTokens('openrouter/deepseek-reasoner')).toBe(64000);
    });
  });

  describe('processModelData with Meta models', () => {
    test('should process Meta model data correctly', () => {
      const input = {
        data: [
          {
            id: 'llama2',
            pricing: {
              prompt: '0.00001',
              completion: '0.00003',
            },
            context_length: 4000,
          },
          {
            id: 'llama3',
            pricing: {
              prompt: '0.00002',
              completion: '0.00004',
            },
            context_length: 8000,
          },
        ],
      };

      const result = processModelData(input);
      expect(result.llama2).toEqual({
        prompt: 10,
        completion: 30,
        context: 4000,
      });
      expect(result.llama3).toEqual({
        prompt: 20,
        completion: 40,
        context: 8000,
      });
    });
  });
});

describe('Grok Model Tests - Tokens', () => {
  describe('getModelMaxTokens', () => {
    test('should return correct tokens for Grok vision models', () => {
      expect(getModelMaxTokens('grok-2-vision-1212')).toBe(32768);
      expect(getModelMaxTokens('grok-2-vision')).toBe(32768);
      expect(getModelMaxTokens('grok-2-vision-latest')).toBe(32768);
    });

    test('should return correct tokens for Grok beta models', () => {
      expect(getModelMaxTokens('grok-vision-beta')).toBe(8192);
      expect(getModelMaxTokens('grok-beta')).toBe(131072);
    });

    test('should return correct tokens for Grok text models', () => {
      expect(getModelMaxTokens('grok-2-1212')).toBe(131072);
      expect(getModelMaxTokens('grok-2')).toBe(131072);
      expect(getModelMaxTokens('grok-2-latest')).toBe(131072);
    });

    test('should return correct tokens for Grok 3 series models', () => {
      expect(getModelMaxTokens('grok-3')).toBe(131072);
      expect(getModelMaxTokens('grok-3-fast')).toBe(131072);
      expect(getModelMaxTokens('grok-3-mini')).toBe(131072);
      expect(getModelMaxTokens('grok-3-mini-fast')).toBe(131072);
    });

    test('should return correct tokens for Grok 4 model', () => {
      expect(getModelMaxTokens('grok-4-0709')).toBe(256000);
    });

    test('should return correct tokens for Grok 4 Fast and Grok 4.1 Fast models', () => {
      expect(getModelMaxTokens('grok-4-fast')).toBe(2000000);
      expect(getModelMaxTokens('grok-4-1-fast-reasoning')).toBe(2000000);
      expect(getModelMaxTokens('grok-4-1-fast-non-reasoning')).toBe(2000000);
    });

    test('should return correct tokens for Grok Code Fast model', () => {
      expect(getModelMaxTokens('grok-code-fast-1')).toBe(256000);
    });

    test('should handle partial matches for Grok models with prefixes', () => {
      // Vision models should match before general models
      expect(getModelMaxTokens('xai/grok-2-vision-1212')).toBe(32768);
      expect(getModelMaxTokens('xai/grok-2-vision')).toBe(32768);
      expect(getModelMaxTokens('xai/grok-2-vision-latest')).toBe(32768);
      // Beta models
      expect(getModelMaxTokens('xai/grok-vision-beta')).toBe(8192);
      expect(getModelMaxTokens('xai/grok-beta')).toBe(131072);
      // Text models
      expect(getModelMaxTokens('xai/grok-2-1212')).toBe(131072);
      expect(getModelMaxTokens('xai/grok-2')).toBe(131072);
      expect(getModelMaxTokens('xai/grok-2-latest')).toBe(131072);
      // Grok 3 models
      expect(getModelMaxTokens('xai/grok-3')).toBe(131072);
      expect(getModelMaxTokens('xai/grok-3-fast')).toBe(131072);
      expect(getModelMaxTokens('xai/grok-3-mini')).toBe(131072);
      expect(getModelMaxTokens('xai/grok-3-mini-fast')).toBe(131072);
      // Grok 4 model
      expect(getModelMaxTokens('xai/grok-4-0709')).toBe(256000);
      // Grok 4 Fast and 4.1 Fast models
      expect(getModelMaxTokens('xai/grok-4-fast')).toBe(2000000);
      expect(getModelMaxTokens('xai/grok-4-1-fast-reasoning')).toBe(2000000);
      expect(getModelMaxTokens('xai/grok-4-1-fast-non-reasoning')).toBe(2000000);
      // Grok Code Fast model
      expect(getModelMaxTokens('xai/grok-code-fast-1')).toBe(256000);
    });
  });

  describe('matchModelName', () => {
    test('should match exact Grok model names', () => {
      // Vision models
      expect(matchModelName('grok-2-vision-1212')).toBe('grok-2-vision-1212');
      expect(matchModelName('grok-2-vision')).toBe('grok-2-vision');
      expect(matchModelName('grok-2-vision-latest')).toBe('grok-2-vision-latest');
      // Beta models
      expect(matchModelName('grok-vision-beta')).toBe('grok-vision-beta');
      expect(matchModelName('grok-beta')).toBe('grok-beta');
      // Text models
      expect(matchModelName('grok-2-1212')).toBe('grok-2-1212');
      expect(matchModelName('grok-2')).toBe('grok-2');
      expect(matchModelName('grok-2-latest')).toBe('grok-2-latest');
      // Grok 3 models
      expect(matchModelName('grok-3')).toBe('grok-3');
      expect(matchModelName('grok-3-fast')).toBe('grok-3-fast');
      expect(matchModelName('grok-3-mini')).toBe('grok-3-mini');
      expect(matchModelName('grok-3-mini-fast')).toBe('grok-3-mini-fast');
      // Grok 4 model
      expect(matchModelName('grok-4-0709')).toBe('grok-4');
      // Grok 4 Fast and 4.1 Fast models
      expect(matchModelName('grok-4-fast')).toBe('grok-4-fast');
      expect(matchModelName('grok-4-1-fast-reasoning')).toBe('grok-4-1-fast');
      expect(matchModelName('grok-4-1-fast-non-reasoning')).toBe('grok-4-1-fast');
      // Grok Code Fast model
      expect(matchModelName('grok-code-fast-1')).toBe('grok-code-fast');
    });

    test('should match Grok model variations with prefixes', () => {
      // Vision models should match before general models
      expect(matchModelName('xai/grok-2-vision-1212')).toBe('grok-2-vision-1212');
      expect(matchModelName('xai/grok-2-vision')).toBe('grok-2-vision');
      expect(matchModelName('xai/grok-2-vision-latest')).toBe('grok-2-vision-latest');
      // Beta models
      expect(matchModelName('xai/grok-vision-beta')).toBe('grok-vision-beta');
      expect(matchModelName('xai/grok-beta')).toBe('grok-beta');
      // Text models
      expect(matchModelName('xai/grok-2-1212')).toBe('grok-2-1212');
      expect(matchModelName('xai/grok-2')).toBe('grok-2');
      expect(matchModelName('xai/grok-2-latest')).toBe('grok-2-latest');
      // Grok 3 models
      expect(matchModelName('xai/grok-3')).toBe('grok-3');
      expect(matchModelName('xai/grok-3-fast')).toBe('grok-3-fast');
      expect(matchModelName('xai/grok-3-mini')).toBe('grok-3-mini');
      expect(matchModelName('xai/grok-3-mini-fast')).toBe('grok-3-mini-fast');
      // Grok 4 model
      expect(matchModelName('xai/grok-4-0709')).toBe('grok-4');
      // Grok 4 Fast and 4.1 Fast models
      expect(matchModelName('xai/grok-4-fast')).toBe('grok-4-fast');
      expect(matchModelName('xai/grok-4-1-fast-reasoning')).toBe('grok-4-1-fast');
      expect(matchModelName('xai/grok-4-1-fast-non-reasoning')).toBe('grok-4-1-fast');
      // Grok Code Fast model
      expect(matchModelName('xai/grok-code-fast-1')).toBe('grok-code-fast');
    });
  });
});

describe('Claude Model Tests', () => {
  it('should return correct context length for Claude 4 models', () => {
    expect(getModelMaxTokens('claude-sonnet-4')).toBe(
      maxTokensMap[EModelEndpoint.anthropic]['claude-sonnet-4'],
    );
    expect(getModelMaxTokens('claude-opus-4')).toBe(
      maxTokensMap[EModelEndpoint.anthropic]['claude-opus-4'],
    );
  });

  it('should return correct context length for Claude Haiku 4.5', () => {
    expect(getModelMaxTokens('claude-haiku-4-5', EModelEndpoint.anthropic)).toBe(
      maxTokensMap[EModelEndpoint.anthropic]['claude-haiku-4-5'],
    );
    expect(getModelMaxTokens('claude-haiku-4-5')).toBe(
      maxTokensMap[EModelEndpoint.anthropic]['claude-haiku-4-5'],
    );
  });

  it('should return correct context length for Claude Opus 4.5', () => {
    expect(getModelMaxTokens('claude-opus-4-5', EModelEndpoint.anthropic)).toBe(
      maxTokensMap[EModelEndpoint.anthropic]['claude-opus-4-5'],
    );
    expect(getModelMaxTokens('claude-opus-4-5')).toBe(
      maxTokensMap[EModelEndpoint.anthropic]['claude-opus-4-5'],
    );
  });

  it('should handle Claude Haiku 4.5 model name variations', () => {
    const modelVariations = [
      'claude-haiku-4-5',
      'claude-haiku-4-5-20250420',
      'claude-haiku-4-5-latest',
      'anthropic/claude-haiku-4-5',
      'claude-haiku-4-5/anthropic',
      'claude-haiku-4-5-preview',
    ];

    modelVariations.forEach((model) => {
      const modelKey = findMatchingPattern(model, maxTokensMap[EModelEndpoint.anthropic]);
      expect(modelKey).toBe('claude-haiku-4-5');
      expect(getModelMaxTokens(model, EModelEndpoint.anthropic)).toBe(
        maxTokensMap[EModelEndpoint.anthropic]['claude-haiku-4-5'],
      );
    });
  });

  it('should handle Claude Opus 4.5 model name variations', () => {
    const modelVariations = [
      'claude-opus-4-5',
      'claude-opus-4-5-20250420',
      'claude-opus-4-5-latest',
      'anthropic/claude-opus-4-5',
      'claude-opus-4-5/anthropic',
      'claude-opus-4-5-preview',
    ];

    modelVariations.forEach((model) => {
      const modelKey = findMatchingPattern(model, maxTokensMap[EModelEndpoint.anthropic]);
      expect(modelKey).toBe('claude-opus-4-5');
      expect(getModelMaxTokens(model, EModelEndpoint.anthropic)).toBe(
        maxTokensMap[EModelEndpoint.anthropic]['claude-opus-4-5'],
      );
    });
  });

  it('should match model names correctly for Claude Haiku 4.5', () => {
    const modelVariations = [
      'claude-haiku-4-5',
      'claude-haiku-4-5-20250420',
      'claude-haiku-4-5-latest',
      'anthropic/claude-haiku-4-5',
      'claude-haiku-4-5/anthropic',
      'claude-haiku-4-5-preview',
    ];

    modelVariations.forEach((model) => {
      expect(matchModelName(model, EModelEndpoint.anthropic)).toBe('claude-haiku-4-5');
    });
  });

  it('should match model names correctly for Claude Opus 4.5', () => {
    const modelVariations = [
      'claude-opus-4-5',
      'claude-opus-4-5-20250420',
      'claude-opus-4-5-latest',
      'anthropic/claude-opus-4-5',
      'claude-opus-4-5/anthropic',
      'claude-opus-4-5-preview',
    ];

    modelVariations.forEach((model) => {
      expect(matchModelName(model, EModelEndpoint.anthropic)).toBe('claude-opus-4-5');
    });
  });

  it('should handle Claude 4 model name variations with different prefixes and suffixes', () => {
    const modelVariations = [
      'claude-sonnet-4',
      'claude-sonnet-4-20240229',
      'claude-sonnet-4-latest',
      'anthropic/claude-sonnet-4',
      'claude-sonnet-4/anthropic',
      'claude-sonnet-4-preview',
      'claude-sonnet-4-20240229-preview',
      'claude-opus-4',
      'claude-opus-4-20240229',
      'claude-opus-4-latest',
      'anthropic/claude-opus-4',
      'claude-opus-4/anthropic',
      'claude-opus-4-preview',
      'claude-opus-4-20240229-preview',
    ];

    modelVariations.forEach((model) => {
      const modelKey = findMatchingPattern(model, maxTokensMap[EModelEndpoint.anthropic]);
      expect(getModelMaxTokens(model)).toBe(maxTokensMap[EModelEndpoint.anthropic][modelKey]);
    });
  });

  it('should match model names correctly for Claude 4 models', () => {
    const modelVariations = [
      'claude-sonnet-4',
      'claude-sonnet-4-20240229',
      'claude-sonnet-4-latest',
      'anthropic/claude-sonnet-4',
      'claude-sonnet-4/anthropic',
      'claude-sonnet-4-preview',
      'claude-sonnet-4-20240229-preview',
      'claude-opus-4',
      'claude-opus-4-20240229',
      'claude-opus-4-latest',
      'anthropic/claude-opus-4',
      'claude-opus-4/anthropic',
      'claude-opus-4-preview',
      'claude-opus-4-20240229-preview',
    ];

    modelVariations.forEach((model) => {
      const isSonnet = model.includes('sonnet');
      const expectedModel = isSonnet ? 'claude-sonnet-4' : 'claude-opus-4';
      expect(matchModelName(model, EModelEndpoint.anthropic)).toBe(expectedModel);
    });
  });
});

describe('Kimi Model Tests', () => {
  describe('getModelMaxTokens', () => {
    test('should return correct tokens for Kimi models', () => {
      expect(getModelMaxTokens('kimi')).toBe(131000);
      expect(getModelMaxTokens('kimi-k2')).toBe(131000);
      expect(getModelMaxTokens('kimi-vl')).toBe(131000);
    });

    test('should return correct tokens for Kimi models with provider prefix', () => {
      expect(getModelMaxTokens('moonshotai/kimi-k2')).toBe(131000);
      expect(getModelMaxTokens('moonshotai/kimi')).toBe(131000);
      expect(getModelMaxTokens('moonshotai/kimi-vl')).toBe(131000);
    });

    test('should handle partial matches for Kimi models', () => {
      expect(getModelMaxTokens('kimi-k2-latest')).toBe(131000);
      expect(getModelMaxTokens('kimi-vl-preview')).toBe(131000);
      expect(getModelMaxTokens('kimi-2024')).toBe(131000);
    });
  });

  describe('matchModelName', () => {
    test('should match exact Kimi model names', () => {
      expect(matchModelName('kimi')).toBe('kimi');
      expect(matchModelName('kimi-k2')).toBe('kimi');
      expect(matchModelName('kimi-vl')).toBe('kimi');
    });

    test('should match Kimi model variations with provider prefix', () => {
      expect(matchModelName('moonshotai/kimi')).toBe('kimi');
      expect(matchModelName('moonshotai/kimi-k2')).toBe('kimi');
      expect(matchModelName('moonshotai/kimi-vl')).toBe('kimi');
    });

    test('should match Kimi model variations with suffixes', () => {
      expect(matchModelName('kimi-k2-latest')).toBe('kimi');
      expect(matchModelName('kimi-vl-preview')).toBe('kimi');
      expect(matchModelName('kimi-2024')).toBe('kimi');
    });
  });
});

describe('Qwen3 Model Tests', () => {
  describe('getModelMaxTokens', () => {
    test('should return correct tokens for Qwen3 base pattern', () => {
      expect(getModelMaxTokens('qwen3')).toBe(maxTokensMap[EModelEndpoint.openAI]['qwen3']);
    });

    test('should return correct tokens for qwen3-4b (falls back to qwen3)', () => {
      expect(getModelMaxTokens('qwen3-4b')).toBe(maxTokensMap[EModelEndpoint.openAI]['qwen3']);
    });

    test('should return correct tokens for Qwen3 base models', () => {
      expect(getModelMaxTokens('qwen3-8b')).toBe(maxTokensMap[EModelEndpoint.openAI]['qwen3-8b']);
      expect(getModelMaxTokens('qwen3-14b')).toBe(maxTokensMap[EModelEndpoint.openAI]['qwen3-14b']);
      expect(getModelMaxTokens('qwen3-32b')).toBe(maxTokensMap[EModelEndpoint.openAI]['qwen3-32b']);
      expect(getModelMaxTokens('qwen3-235b-a22b')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-235b-a22b'],
      );
    });

    test('should return correct tokens for Qwen3 VL (Vision-Language) models', () => {
      expect(getModelMaxTokens('qwen3-vl-8b-thinking')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-vl-8b-thinking'],
      );
      expect(getModelMaxTokens('qwen3-vl-8b-instruct')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-vl-8b-instruct'],
      );
      expect(getModelMaxTokens('qwen3-vl-30b-a3b')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-vl-30b-a3b'],
      );
      expect(getModelMaxTokens('qwen3-vl-235b-a22b')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-vl-235b-a22b'],
      );
    });

    test('should return correct tokens for Qwen3 specialized models', () => {
      expect(getModelMaxTokens('qwen3-max')).toBe(maxTokensMap[EModelEndpoint.openAI]['qwen3-max']);
      expect(getModelMaxTokens('qwen3-coder')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-coder'],
      );
      expect(getModelMaxTokens('qwen3-coder-30b-a3b')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-coder-30b-a3b'],
      );
      expect(getModelMaxTokens('qwen3-coder-plus')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-coder-plus'],
      );
      expect(getModelMaxTokens('qwen3-coder-flash')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-coder-flash'],
      );
      expect(getModelMaxTokens('qwen3-next-80b-a3b')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-next-80b-a3b'],
      );
    });

    test('should handle Qwen3 models with provider prefixes', () => {
      expect(getModelMaxTokens('alibaba/qwen3')).toBe(maxTokensMap[EModelEndpoint.openAI]['qwen3']);
      expect(getModelMaxTokens('alibaba/qwen3-4b')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3'],
      );
      expect(getModelMaxTokens('qwen/qwen3-8b')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-8b'],
      );
      expect(getModelMaxTokens('openrouter/qwen3-max')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-max'],
      );
      expect(getModelMaxTokens('alibaba/qwen3-vl-8b-instruct')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-vl-8b-instruct'],
      );
      expect(getModelMaxTokens('qwen/qwen3-coder')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-coder'],
      );
    });

    test('should handle Qwen3 models with suffixes', () => {
      expect(getModelMaxTokens('qwen3-preview')).toBe(maxTokensMap[EModelEndpoint.openAI]['qwen3']);
      expect(getModelMaxTokens('qwen3-4b-preview')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3'],
      );
      expect(getModelMaxTokens('qwen3-8b-latest')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-8b'],
      );
      expect(getModelMaxTokens('qwen3-max-2024')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['qwen3-max'],
      );
    });
  });

  describe('matchModelName', () => {
    test('should match exact Qwen3 model names', () => {
      expect(matchModelName('qwen3')).toBe('qwen3');
      expect(matchModelName('qwen3-4b')).toBe('qwen3');
      expect(matchModelName('qwen3-8b')).toBe('qwen3-8b');
      expect(matchModelName('qwen3-vl-8b-thinking')).toBe('qwen3-vl-8b-thinking');
      expect(matchModelName('qwen3-max')).toBe('qwen3-max');
      expect(matchModelName('qwen3-coder')).toBe('qwen3-coder');
    });

    test('should match Qwen3 model variations with provider prefixes', () => {
      expect(matchModelName('alibaba/qwen3')).toBe('qwen3');
      expect(matchModelName('alibaba/qwen3-4b')).toBe('qwen3');
      expect(matchModelName('qwen/qwen3-8b')).toBe('qwen3-8b');
      expect(matchModelName('openrouter/qwen3-max')).toBe('qwen3-max');
      expect(matchModelName('alibaba/qwen3-vl-8b-instruct')).toBe('qwen3-vl-8b-instruct');
      expect(matchModelName('qwen/qwen3-coder')).toBe('qwen3-coder');
    });

    test('should match Qwen3 model variations with suffixes', () => {
      expect(matchModelName('qwen3-preview')).toBe('qwen3');
      expect(matchModelName('qwen3-4b-preview')).toBe('qwen3');
      expect(matchModelName('qwen3-8b-latest')).toBe('qwen3-8b');
      expect(matchModelName('qwen3-max-2024')).toBe('qwen3-max');
      expect(matchModelName('qwen3-coder-v1')).toBe('qwen3-coder');
    });
  });
});

describe('GLM Model Tests (Zhipu AI)', () => {
  describe('getModelMaxTokens', () => {
    test('should return correct tokens for GLM models', () => {
      expect(getModelMaxTokens('glm-4.6')).toBe(200000);
      expect(getModelMaxTokens('glm-4.5v')).toBe(66000);
      expect(getModelMaxTokens('glm-4.5-air')).toBe(131000);
      expect(getModelMaxTokens('glm-4.5')).toBe(131000);
      expect(getModelMaxTokens('glm-4-32b')).toBe(128000);
      expect(getModelMaxTokens('glm-4')).toBe(128000);
      expect(getModelMaxTokens('glm4')).toBe(128000);
    });

    test('should handle partial matches for GLM models with provider prefixes', () => {
      expect(getModelMaxTokens('z-ai/glm-4.6')).toBe(200000);
      expect(getModelMaxTokens('z-ai/glm-4.5')).toBe(131000);
      expect(getModelMaxTokens('z-ai/glm-4.5-air')).toBe(131000);
      expect(getModelMaxTokens('z-ai/glm-4.5v')).toBe(66000);
      expect(getModelMaxTokens('z-ai/glm-4-32b')).toBe(128000);

      expect(getModelMaxTokens('zai/glm-4.6')).toBe(200000);
      expect(getModelMaxTokens('zai/glm-4.5')).toBe(131000);
      expect(getModelMaxTokens('zai/glm-4.5-air')).toBe(131000);
      expect(getModelMaxTokens('zai/glm-4.5v')).toBe(66000);

      expect(getModelMaxTokens('zai-org/GLM-4.6')).toBe(200000);
      expect(getModelMaxTokens('zai-org/GLM-4.5')).toBe(131000);
      expect(getModelMaxTokens('zai-org/GLM-4.5-Air')).toBe(131000);
      expect(getModelMaxTokens('zai-org/GLM-4.5V')).toBe(66000);
      expect(getModelMaxTokens('zai-org/GLM-4-32B-0414')).toBe(128000);
    });

    test('should handle GLM model variations with suffixes', () => {
      expect(getModelMaxTokens('glm-4.6-fp8')).toBe(200000);
      expect(getModelMaxTokens('zai-org/GLM-4.6-FP8')).toBe(200000);
      expect(getModelMaxTokens('zai-org/GLM-4.5-Air-FP8')).toBe(131000);
    });

    test('should prioritize more specific GLM patterns', () => {
      expect(getModelMaxTokens('glm-4.5-air-custom')).toBe(131000);
      expect(getModelMaxTokens('glm-4.5-custom')).toBe(131000);
      expect(getModelMaxTokens('glm-4.5v-custom')).toBe(66000);
    });
  });

  describe('matchModelName', () => {
    test('should match exact GLM model names', () => {
      expect(matchModelName('glm-4.6')).toBe('glm-4.6');
      expect(matchModelName('glm-4.5v')).toBe('glm-4.5v');
      expect(matchModelName('glm-4.5-air')).toBe('glm-4.5-air');
      expect(matchModelName('glm-4.5')).toBe('glm-4.5');
      expect(matchModelName('glm-4-32b')).toBe('glm-4-32b');
      expect(matchModelName('glm-4')).toBe('glm-4');
      expect(matchModelName('glm4')).toBe('glm4');
    });

    test('should match GLM model variations with provider prefixes', () => {
      expect(matchModelName('z-ai/glm-4.6')).toBe('glm-4.6');
      expect(matchModelName('z-ai/glm-4.5')).toBe('glm-4.5');
      expect(matchModelName('z-ai/glm-4.5-air')).toBe('glm-4.5-air');
      expect(matchModelName('z-ai/glm-4.5v')).toBe('glm-4.5v');
      expect(matchModelName('z-ai/glm-4-32b')).toBe('glm-4-32b');

      expect(matchModelName('zai/glm-4.6')).toBe('glm-4.6');
      expect(matchModelName('zai/glm-4.5')).toBe('glm-4.5');
      expect(matchModelName('zai/glm-4.5-air')).toBe('glm-4.5-air');
      expect(matchModelName('zai/glm-4.5v')).toBe('glm-4.5v');

      expect(matchModelName('zai-org/GLM-4.6')).toBe('glm-4.6');
      expect(matchModelName('zai-org/GLM-4.5')).toBe('glm-4.5');
      expect(matchModelName('zai-org/GLM-4.5-Air')).toBe('glm-4.5-air');
      expect(matchModelName('zai-org/GLM-4.5V')).toBe('glm-4.5v');
      expect(matchModelName('zai-org/GLM-4-32B-0414')).toBe('glm-4-32b');
    });

    test('should match GLM model variations with suffixes', () => {
      expect(matchModelName('glm-4.6-fp8')).toBe('glm-4.6');
      expect(matchModelName('zai-org/GLM-4.6-FP8')).toBe('glm-4.6');
      expect(matchModelName('zai-org/GLM-4.5-Air-FP8')).toBe('glm-4.5-air');
    });

    test('should handle case-insensitive matching for GLM models', () => {
      expect(matchModelName('zai-org/GLM-4.6')).toBe('glm-4.6');
      expect(matchModelName('zai-org/GLM-4.5V')).toBe('glm-4.5v');
      expect(matchModelName('zai-org/GLM-4-32B-0414')).toBe('glm-4-32b');
    });
  });
});
