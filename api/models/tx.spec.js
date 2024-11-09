const { EModelEndpoint } = require('librechat-data-provider');
const {
  defaultRate,
  tokenValues,
  getValueKey,
  getMultiplier,
  getCacheMultiplier,
} = require('./tx');

describe('getValueKey', () => {
  it('should return "16k" for model name containing "gpt-3.5-turbo-16k"', () => {
    expect(getValueKey('gpt-3.5-turbo-16k-some-other-info')).toBe('16k');
  });

  it('should return "4k" for model name containing "gpt-3.5"', () => {
    expect(getValueKey('gpt-3.5-some-other-info')).toBe('4k');
  });

  it('should return "32k" for model name containing "gpt-4-32k"', () => {
    expect(getValueKey('gpt-4-32k-some-other-info')).toBe('32k');
  });

  it('should return "8k" for model name containing "gpt-4"', () => {
    expect(getValueKey('gpt-4-some-other-info')).toBe('8k');
  });

  it('should return undefined for model names that do not match any known patterns', () => {
    expect(getValueKey('gpt-5-some-other-info')).toBeUndefined();
  });

  it('should return "gpt-3.5-turbo-1106" for model name containing "gpt-3.5-turbo-1106"', () => {
    expect(getValueKey('gpt-3.5-turbo-1106-some-other-info')).toBe('gpt-3.5-turbo-1106');
    expect(getValueKey('openai/gpt-3.5-turbo-1106')).toBe('gpt-3.5-turbo-1106');
    expect(getValueKey('gpt-3.5-turbo-1106/openai')).toBe('gpt-3.5-turbo-1106');
  });

  it('should return "gpt-4-1106" for model name containing "gpt-4-1106"', () => {
    expect(getValueKey('gpt-4-1106-some-other-info')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-1106-vision-preview')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-1106-preview')).toBe('gpt-4-1106');
    expect(getValueKey('openai/gpt-4-1106')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-1106/openai/')).toBe('gpt-4-1106');
  });

  it('should return "gpt-4-1106" for model type of "gpt-4-1106"', () => {
    expect(getValueKey('gpt-4-vision-preview')).toBe('gpt-4-1106');
    expect(getValueKey('openai/gpt-4-1106')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-turbo')).toBe('gpt-4-1106');
    expect(getValueKey('gpt-4-0125')).toBe('gpt-4-1106');
  });

  it('should return "gpt-4o" for model type of "gpt-4o"', () => {
    expect(getValueKey('gpt-4o-2024-08-06')).toBe('gpt-4o');
    expect(getValueKey('gpt-4o-2024-08-06-0718')).toBe('gpt-4o');
    expect(getValueKey('openai/gpt-4o')).toBe('gpt-4o');
    expect(getValueKey('openai/gpt-4o-2024-08-06')).toBe('gpt-4o');
    expect(getValueKey('gpt-4o-turbo')).toBe('gpt-4o');
    expect(getValueKey('gpt-4o-0125')).toBe('gpt-4o');
  });

  it('should return "gpt-4o-mini" for model type of "gpt-4o-mini"', () => {
    expect(getValueKey('gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
    expect(getValueKey('openai/gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(getValueKey('gpt-4o-mini-0718')).toBe('gpt-4o-mini');
    expect(getValueKey('gpt-4o-2024-08-06-0718')).not.toBe('gpt-4o-mini');
  });

  it('should return "gpt-4o-2024-05-13" for model type of "gpt-4o-2024-05-13"', () => {
    expect(getValueKey('gpt-4o-2024-05-13')).toBe('gpt-4o-2024-05-13');
    expect(getValueKey('openai/gpt-4o-2024-05-13')).toBe('gpt-4o-2024-05-13');
    expect(getValueKey('gpt-4o-2024-05-13-0718')).toBe('gpt-4o-2024-05-13');
    expect(getValueKey('gpt-4o-2024-05-13-0718')).not.toBe('gpt-4o');
  });

  it('should return "gpt-4o" for model type of "chatgpt-4o"', () => {
    expect(getValueKey('chatgpt-4o-latest')).toBe('gpt-4o');
    expect(getValueKey('openai/chatgpt-4o-latest')).toBe('gpt-4o');
    expect(getValueKey('chatgpt-4o-latest-0916')).toBe('gpt-4o');
    expect(getValueKey('chatgpt-4o-latest-0718')).toBe('gpt-4o');
  });

  it('should return "claude-3-5-sonnet" for model type of "claude-3-5-sonnet-"', () => {
    expect(getValueKey('claude-3-5-sonnet-20240620')).toBe('claude-3-5-sonnet');
    expect(getValueKey('anthropic/claude-3-5-sonnet')).toBe('claude-3-5-sonnet');
    expect(getValueKey('claude-3-5-sonnet-turbo')).toBe('claude-3-5-sonnet');
    expect(getValueKey('claude-3-5-sonnet-0125')).toBe('claude-3-5-sonnet');
  });

  it('should return "claude-3.5-sonnet" for model type of "claude-3.5-sonnet-"', () => {
    expect(getValueKey('claude-3.5-sonnet-20240620')).toBe('claude-3.5-sonnet');
    expect(getValueKey('anthropic/claude-3.5-sonnet')).toBe('claude-3.5-sonnet');
    expect(getValueKey('claude-3.5-sonnet-turbo')).toBe('claude-3.5-sonnet');
    expect(getValueKey('claude-3.5-sonnet-0125')).toBe('claude-3.5-sonnet');
  });

  it('should return "claude-3-5-haiku" for model type of "claude-3-5-haiku-"', () => {
    expect(getValueKey('claude-3-5-haiku-20240620')).toBe('claude-3-5-haiku');
    expect(getValueKey('anthropic/claude-3-5-haiku')).toBe('claude-3-5-haiku');
    expect(getValueKey('claude-3-5-haiku-turbo')).toBe('claude-3-5-haiku');
    expect(getValueKey('claude-3-5-haiku-0125')).toBe('claude-3-5-haiku');
  });

  it('should return "claude-3.5-haiku" for model type of "claude-3.5-haiku-"', () => {
    expect(getValueKey('claude-3.5-haiku-20240620')).toBe('claude-3.5-haiku');
    expect(getValueKey('anthropic/claude-3.5-haiku')).toBe('claude-3.5-haiku');
    expect(getValueKey('claude-3.5-haiku-turbo')).toBe('claude-3.5-haiku');
    expect(getValueKey('claude-3.5-haiku-0125')).toBe('claude-3.5-haiku');
  });
});

describe('getMultiplier', () => {
  it('should return the correct multiplier for a given valueKey and tokenType', () => {
    expect(getMultiplier({ valueKey: '8k', tokenType: 'prompt' })).toBe(tokenValues['8k'].prompt);
    expect(getMultiplier({ valueKey: '8k', tokenType: 'completion' })).toBe(
      tokenValues['8k'].completion,
    );
  });

  it('should return defaultRate if tokenType is provided but not found in tokenValues', () => {
    expect(getMultiplier({ valueKey: '8k', tokenType: 'unknownType' })).toBe(defaultRate);
  });

  it('should derive the valueKey from the model if not provided', () => {
    expect(getMultiplier({ tokenType: 'prompt', model: 'gpt-4-some-other-info' })).toBe(
      tokenValues['8k'].prompt,
    );
  });

  it('should return 1 if only model or tokenType is missing', () => {
    expect(getMultiplier({ tokenType: 'prompt' })).toBe(1);
    expect(getMultiplier({ model: 'gpt-4-some-other-info' })).toBe(1);
  });

  it('should return the correct multiplier for gpt-3.5-turbo-1106', () => {
    expect(getMultiplier({ valueKey: 'gpt-3.5-turbo-1106', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-3.5-turbo-1106'].prompt,
    );
    expect(getMultiplier({ valueKey: 'gpt-3.5-turbo-1106', tokenType: 'completion' })).toBe(
      tokenValues['gpt-3.5-turbo-1106'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4-1106', () => {
    expect(getMultiplier({ valueKey: 'gpt-4-1106', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4-1106'].prompt,
    );
    expect(getMultiplier({ valueKey: 'gpt-4-1106', tokenType: 'completion' })).toBe(
      tokenValues['gpt-4-1106'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4o', () => {
    const valueKey = getValueKey('gpt-4o-2024-08-06');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-4o'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4o'].completion,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).not.toBe(
      tokenValues['gpt-4-1106'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4o-mini', () => {
    const valueKey = getValueKey('gpt-4o-mini-2024-07-18');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4o-mini'].prompt,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4o-mini'].completion,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).not.toBe(
      tokenValues['gpt-4-1106'].completion,
    );
  });

  it('should return the correct multiplier for chatgpt-4o-latest', () => {
    const valueKey = getValueKey('chatgpt-4o-latest');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-4o'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4o'].completion,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).not.toBe(
      tokenValues['gpt-4o-mini'].completion,
    );
  });

  it('should derive the valueKey from the model if not provided for new models', () => {
    expect(
      getMultiplier({ tokenType: 'prompt', model: 'gpt-3.5-turbo-1106-some-other-info' }),
    ).toBe(tokenValues['gpt-3.5-turbo-1106'].prompt);
    expect(getMultiplier({ tokenType: 'completion', model: 'gpt-4-1106-vision-preview' })).toBe(
      tokenValues['gpt-4-1106'].completion,
    );
    expect(getMultiplier({ tokenType: 'completion', model: 'gpt-4-0125-preview' })).toBe(
      tokenValues['gpt-4-1106'].completion,
    );
    expect(getMultiplier({ tokenType: 'completion', model: 'gpt-4-turbo-vision-preview' })).toBe(
      tokenValues['gpt-4-1106'].completion,
    );
    expect(getMultiplier({ tokenType: 'completion', model: 'gpt-3.5-turbo-0125' })).toBe(
      tokenValues['gpt-3.5-turbo-0125'].completion,
    );
  });

  it('should return defaultRate if derived valueKey does not match any known patterns', () => {
    expect(getMultiplier({ tokenType: 'prompt', model: 'gpt-5-some-other-info' })).toBe(
      defaultRate,
    );
  });
});

describe('AWS Bedrock Model Tests', () => {
  const awsModels = [
    'anthropic.claude-3-haiku-20240307-v1:0',
    'anthropic.claude-3-sonnet-20240229-v1:0',
    'anthropic.claude-3-opus-20240229-v1:0',
    'anthropic.claude-3-5-sonnet-20240620-v1:0',
    'anthropic.claude-v2:1',
    'anthropic.claude-instant-v1',
    'meta.llama2-13b-chat-v1',
    'meta.llama2-70b-chat-v1',
    'meta.llama3-8b-instruct-v1:0',
    'meta.llama3-70b-instruct-v1:0',
    'meta.llama3-1-8b-instruct-v1:0',
    'meta.llama3-1-70b-instruct-v1:0',
    'meta.llama3-1-405b-instruct-v1:0',
    'mistral.mistral-7b-instruct-v0:2',
    'mistral.mistral-small-2402-v1:0',
    'mistral.mixtral-8x7b-instruct-v0:1',
    'mistral.mistral-large-2402-v1:0',
    'mistral.mistral-large-2407-v1:0',
    'cohere.command-text-v14',
    'cohere.command-light-text-v14',
    'cohere.command-r-v1:0',
    'cohere.command-r-plus-v1:0',
    'ai21.j2-mid-v1',
    'ai21.j2-ultra-v1',
    'amazon.titan-text-lite-v1',
    'amazon.titan-text-express-v1',
  ];

  it('should return the correct prompt multipliers for all models', () => {
    const results = awsModels.map((model) => {
      const valueKey = getValueKey(model, EModelEndpoint.bedrock);
      const multiplier = getMultiplier({ valueKey, tokenType: 'prompt' });
      return tokenValues[valueKey].prompt && multiplier === tokenValues[valueKey].prompt;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct completion multipliers for all models', () => {
    const results = awsModels.map((model) => {
      const valueKey = getValueKey(model, EModelEndpoint.bedrock);
      const multiplier = getMultiplier({ valueKey, tokenType: 'completion' });
      return tokenValues[valueKey].completion && multiplier === tokenValues[valueKey].completion;
    });
    expect(results.every(Boolean)).toBe(true);
  });
});

describe('getCacheMultiplier', () => {
  it('should return the correct cache multiplier for a given valueKey and cacheType', () => {
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'write' })).toBe(3.75);
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'read' })).toBe(0.3);
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-haiku', cacheType: 'write' })).toBe(1.25);
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-haiku', cacheType: 'read' })).toBe(0.1);
    expect(getCacheMultiplier({ valueKey: 'claude-3-haiku', cacheType: 'write' })).toBe(0.3);
    expect(getCacheMultiplier({ valueKey: 'claude-3-haiku', cacheType: 'read' })).toBe(0.03);
  });

  it('should return null if cacheType is provided but not found in cacheTokenValues', () => {
    expect(
      getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'unknownType' }),
    ).toBeNull();
  });

  it('should derive the valueKey from the model if not provided', () => {
    expect(getCacheMultiplier({ cacheType: 'write', model: 'claude-3-5-sonnet-20240620' })).toBe(
      3.75,
    );
    expect(getCacheMultiplier({ cacheType: 'read', model: 'claude-3-haiku-20240307' })).toBe(0.03);
  });

  it('should return null if only model or cacheType is missing', () => {
    expect(getCacheMultiplier({ cacheType: 'write' })).toBeNull();
    expect(getCacheMultiplier({ model: 'claude-3-5-sonnet' })).toBeNull();
  });

  it('should return null if derived valueKey does not match any known patterns', () => {
    expect(getCacheMultiplier({ cacheType: 'write', model: 'gpt-4-some-other-info' })).toBeNull();
  });

  it('should handle endpointTokenConfig if provided', () => {
    const endpointTokenConfig = {
      'custom-model': {
        write: 5,
        read: 1,
      },
    };
    expect(
      getCacheMultiplier({ model: 'custom-model', cacheType: 'write', endpointTokenConfig }),
    ).toBe(5);
    expect(
      getCacheMultiplier({ model: 'custom-model', cacheType: 'read', endpointTokenConfig }),
    ).toBe(1);
  });

  it('should return null if model is not found in endpointTokenConfig', () => {
    const endpointTokenConfig = {
      'custom-model': {
        write: 5,
        read: 1,
      },
    };
    expect(
      getCacheMultiplier({ model: 'unknown-model', cacheType: 'write', endpointTokenConfig }),
    ).toBeNull();
  });

  it('should handle models with "bedrock/" prefix', () => {
    expect(
      getCacheMultiplier({
        model: 'bedrock/anthropic.claude-3-5-sonnet-20240620-v1:0',
        cacheType: 'write',
      }),
    ).toBe(3.75);
    expect(
      getCacheMultiplier({
        model: 'bedrock/anthropic.claude-3-haiku-20240307-v1:0',
        cacheType: 'read',
      }),
    ).toBe(0.03);
  });
});
