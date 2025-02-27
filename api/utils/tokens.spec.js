const { EModelEndpoint } = require('librechat-data-provider');
const { getModelMaxTokens, processModelData, matchModelName, maxTokensMap } = require('./tokens');

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
        maxTokensMap[EModelEndpoint.openAI]['deepseek'],
      );
      expect(getModelMaxTokens('deepseek-coder')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['deepseek'],
      );
      expect(getModelMaxTokens('deepseek-reasoner')).toBe(
        maxTokensMap[EModelEndpoint.openAI]['deepseek-reasoner'],
      );
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
      expect(matchModelName('deepseek-chat')).toBe('deepseek');
      expect(matchModelName('deepseek-coder')).toBe('deepseek');
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

    test('should handle partial matches for Grok models with prefixes', () => {
      // Vision models should match before general models
      expect(getModelMaxTokens('openai/grok-2-vision-1212')).toBe(32768);
      expect(getModelMaxTokens('openai/grok-2-vision')).toBe(32768);
      expect(getModelMaxTokens('openai/grok-2-vision-latest')).toBe(32768);
      // Beta models
      expect(getModelMaxTokens('openai/grok-vision-beta')).toBe(8192);
      expect(getModelMaxTokens('openai/grok-beta')).toBe(131072);
      // Text models
      expect(getModelMaxTokens('openai/grok-2-1212')).toBe(131072);
      expect(getModelMaxTokens('openai/grok-2')).toBe(131072);
      expect(getModelMaxTokens('openai/grok-2-latest')).toBe(131072);
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
    });

    test('should match Grok model variations with prefixes', () => {
      // Vision models should match before general models
      expect(matchModelName('openai/grok-2-vision-1212')).toBe('grok-2-vision-1212');
      expect(matchModelName('openai/grok-2-vision')).toBe('grok-2-vision');
      expect(matchModelName('openai/grok-2-vision-latest')).toBe('grok-2-vision-latest');
      // Beta models
      expect(matchModelName('openai/grok-vision-beta')).toBe('grok-vision-beta');
      expect(matchModelName('openai/grok-beta')).toBe('grok-beta');
      // Text models
      expect(matchModelName('openai/grok-2-1212')).toBe('grok-2-1212');
      expect(matchModelName('openai/grok-2')).toBe('grok-2');
      expect(matchModelName('openai/grok-2-latest')).toBe('grok-2-latest');
    });
  });
});
