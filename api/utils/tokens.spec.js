const { EModelEndpoint } = require('librechat-data-provider');
const { getModelMaxTokens, matchModelName, maxTokensMap } = require('./tokens');

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
    expect(getModelMaxTokens('gemini-1.5-pro-latest', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-1.5'],
    );
    expect(getModelMaxTokens('gemini-1.5-pro-preview-0409', EModelEndpoint.google)).toBe(
      maxTokensMap[EModelEndpoint.google]['gemini-1.5'],
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
    expect(matchModelName('something/gpt-4-1106')).toBe('gpt-4-1106');
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
