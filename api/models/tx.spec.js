const { EModelEndpoint } = require('librechat-data-provider');
const {
  defaultRate,
  tokenValues,
  getValueKey,
  getMultiplier,
  cacheTokenValues,
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

  it('should return "gpt-4.5" for model type of "gpt-4.5"', () => {
    expect(getValueKey('gpt-4.5-preview')).toBe('gpt-4.5');
    expect(getValueKey('gpt-4.5-2024-08-06')).toBe('gpt-4.5');
    expect(getValueKey('gpt-4.5-2024-08-06-0718')).toBe('gpt-4.5');
    expect(getValueKey('openai/gpt-4.5')).toBe('gpt-4.5');
    expect(getValueKey('openai/gpt-4.5-2024-08-06')).toBe('gpt-4.5');
    expect(getValueKey('gpt-4.5-turbo')).toBe('gpt-4.5');
    expect(getValueKey('gpt-4.5-0125')).toBe('gpt-4.5');
  });

  it('should return "gpt-4.1" for model type of "gpt-4.1"', () => {
    expect(getValueKey('gpt-4.1-preview')).toBe('gpt-4.1');
    expect(getValueKey('gpt-4.1-2024-08-06')).toBe('gpt-4.1');
    expect(getValueKey('gpt-4.1-2024-08-06-0718')).toBe('gpt-4.1');
    expect(getValueKey('openai/gpt-4.1')).toBe('gpt-4.1');
    expect(getValueKey('openai/gpt-4.1-2024-08-06')).toBe('gpt-4.1');
    expect(getValueKey('gpt-4.1-turbo')).toBe('gpt-4.1');
    expect(getValueKey('gpt-4.1-0125')).toBe('gpt-4.1');
  });

  it('should return "gpt-4.1-mini" for model type of "gpt-4.1-mini"', () => {
    expect(getValueKey('gpt-4.1-mini-preview')).toBe('gpt-4.1-mini');
    expect(getValueKey('gpt-4.1-mini-2024-08-06')).toBe('gpt-4.1-mini');
    expect(getValueKey('openai/gpt-4.1-mini')).toBe('gpt-4.1-mini');
    expect(getValueKey('gpt-4.1-mini-0125')).toBe('gpt-4.1-mini');
  });

  it('should return "gpt-4.1-nano" for model type of "gpt-4.1-nano"', () => {
    expect(getValueKey('gpt-4.1-nano-preview')).toBe('gpt-4.1-nano');
    expect(getValueKey('gpt-4.1-nano-2024-08-06')).toBe('gpt-4.1-nano');
    expect(getValueKey('openai/gpt-4.1-nano')).toBe('gpt-4.1-nano');
    expect(getValueKey('gpt-4.1-nano-0125')).toBe('gpt-4.1-nano');
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

  it('should return "claude-3-7-sonnet" for model type of "claude-3-7-sonnet-"', () => {
    expect(getValueKey('claude-3-7-sonnet-20240620')).toBe('claude-3-7-sonnet');
    expect(getValueKey('anthropic/claude-3-7-sonnet')).toBe('claude-3-7-sonnet');
    expect(getValueKey('claude-3-7-sonnet-turbo')).toBe('claude-3-7-sonnet');
    expect(getValueKey('claude-3-7-sonnet-0125')).toBe('claude-3-7-sonnet');
  });

  it('should return "claude-3.7-sonnet" for model type of "claude-3.7-sonnet-"', () => {
    expect(getValueKey('claude-3.7-sonnet-20240620')).toBe('claude-3.7-sonnet');
    expect(getValueKey('anthropic/claude-3.7-sonnet')).toBe('claude-3.7-sonnet');
    expect(getValueKey('claude-3.7-sonnet-turbo')).toBe('claude-3.7-sonnet');
    expect(getValueKey('claude-3.7-sonnet-0125')).toBe('claude-3.7-sonnet');
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

  it('should return correct multipliers for o4-mini and o3', () => {
    ['o4-mini', 'o3'].forEach((model) => {
      const prompt = getMultiplier({ model, tokenType: 'prompt' });
      const completion = getMultiplier({ model, tokenType: 'completion' });
      expect(prompt).toBe(tokenValues[model].prompt);
      expect(completion).toBe(tokenValues[model].completion);
    });
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

  it('should return the correct multiplier for gpt-4.1', () => {
    const valueKey = getValueKey('gpt-4.1-2024-08-06');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(tokenValues['gpt-4.1'].prompt);
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1'].completion,
    );
    expect(getMultiplier({ model: 'gpt-4.1-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-4.1', tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4.1-mini', () => {
    const valueKey = getValueKey('gpt-4.1-mini-2024-08-06');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1-mini'].prompt,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1-mini'].completion,
    );
    expect(getMultiplier({ model: 'gpt-4.1-mini-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1-mini'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-4.1-mini', tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1-mini'].completion,
    );
  });

  it('should return the correct multiplier for gpt-4.1-nano', () => {
    const valueKey = getValueKey('gpt-4.1-nano-2024-08-06');
    expect(getMultiplier({ valueKey, tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1-nano'].prompt,
    );
    expect(getMultiplier({ valueKey, tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1-nano'].completion,
    );
    expect(getMultiplier({ model: 'gpt-4.1-nano-preview', tokenType: 'prompt' })).toBe(
      tokenValues['gpt-4.1-nano'].prompt,
    );
    expect(getMultiplier({ model: 'openai/gpt-4.1-nano', tokenType: 'completion' })).toBe(
      tokenValues['gpt-4.1-nano'].completion,
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
    'anthropic.claude-3-5-haiku-20241022-v1:0',
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
    'amazon.nova-micro-v1:0',
    'amazon.nova-lite-v1:0',
    'amazon.nova-pro-v1:0',
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

describe('Deepseek Model Tests', () => {
  const deepseekModels = ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner', 'deepseek.r1'];

  it('should return the correct prompt multipliers for all models', () => {
    const results = deepseekModels.map((model) => {
      const valueKey = getValueKey(model);
      const multiplier = getMultiplier({ valueKey, tokenType: 'prompt' });
      return tokenValues[valueKey].prompt && multiplier === tokenValues[valueKey].prompt;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct completion multipliers for all models', () => {
    const results = deepseekModels.map((model) => {
      const valueKey = getValueKey(model);
      const multiplier = getMultiplier({ valueKey, tokenType: 'completion' });
      return tokenValues[valueKey].completion && multiplier === tokenValues[valueKey].completion;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct prompt multipliers for reasoning model', () => {
    const model = 'deepseek-reasoner';
    const valueKey = getValueKey(model);
    expect(valueKey).toBe(model);
    const multiplier = getMultiplier({ valueKey, tokenType: 'prompt' });
    const result = tokenValues[valueKey].prompt && multiplier === tokenValues[valueKey].prompt;
    expect(result).toBe(true);
  });
});

describe('getCacheMultiplier', () => {
  it('should return the correct cache multiplier for a given valueKey and cacheType', () => {
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-3-5-sonnet'].write,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-3-5-sonnet'].read,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-haiku', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-3-5-haiku'].write,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-5-haiku', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-3-5-haiku'].read,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-haiku', cacheType: 'write' })).toBe(
      cacheTokenValues['claude-3-haiku'].write,
    );
    expect(getCacheMultiplier({ valueKey: 'claude-3-haiku', cacheType: 'read' })).toBe(
      cacheTokenValues['claude-3-haiku'].read,
    );
  });

  it('should return null if cacheType is provided but not found in cacheTokenValues', () => {
    expect(
      getCacheMultiplier({ valueKey: 'claude-3-5-sonnet', cacheType: 'unknownType' }),
    ).toBeNull();
  });

  it('should derive the valueKey from the model if not provided', () => {
    expect(getCacheMultiplier({ cacheType: 'write', model: 'claude-3-5-sonnet-20240620' })).toBe(
      cacheTokenValues['claude-3-5-sonnet'].write,
    );
    expect(getCacheMultiplier({ cacheType: 'read', model: 'claude-3-haiku-20240307' })).toBe(
      cacheTokenValues['claude-3-haiku'].read,
    );
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
    ).toBe(endpointTokenConfig['custom-model'].write);
    expect(
      getCacheMultiplier({ model: 'custom-model', cacheType: 'read', endpointTokenConfig }),
    ).toBe(endpointTokenConfig['custom-model'].read);
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
    ).toBe(cacheTokenValues['claude-3-5-sonnet'].write);
    expect(
      getCacheMultiplier({
        model: 'bedrock/anthropic.claude-3-haiku-20240307-v1:0',
        cacheType: 'read',
      }),
    ).toBe(cacheTokenValues['claude-3-haiku'].read);
  });
});

describe('Google Model Tests', () => {
  const googleModels = [
    'gemini-2.0-flash-lite-preview-02-05',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-exp',
    'gemini-2.0-pro-exp-02-05',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash-thinking',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro-preview-0409',
    'gemini-pro-vision',
    'gemini-1.0',
    'gemini-pro',
  ];

  it('should return the correct prompt and completion rates for all models', () => {
    const results = googleModels.map((model) => {
      const valueKey = getValueKey(model, EModelEndpoint.google);
      const promptRate = getMultiplier({
        model,
        tokenType: 'prompt',
        endpoint: EModelEndpoint.google,
      });
      const completionRate = getMultiplier({
        model,
        tokenType: 'completion',
        endpoint: EModelEndpoint.google,
      });
      return { model, valueKey, promptRate, completionRate };
    });

    results.forEach(({ valueKey, promptRate, completionRate }) => {
      expect(promptRate).toBe(tokenValues[valueKey].prompt);
      expect(completionRate).toBe(tokenValues[valueKey].completion);
    });
  });

  it('should map to the correct model keys', () => {
    const expected = {
      'gemini-2.0-flash-lite-preview-02-05': 'gemini-2.0-flash-lite',
      'gemini-2.0-flash-001': 'gemini-2.0-flash',
      'gemini-2.0-flash-exp': 'gemini-2.0-flash',
      'gemini-2.0-pro-exp-02-05': 'gemini-2.0',
      'gemini-1.5-flash-8b': 'gemini-1.5-flash-8b',
      'gemini-1.5-flash-thinking': 'gemini-1.5-flash',
      'gemini-1.5-pro-latest': 'gemini-1.5',
      'gemini-1.5-pro-preview-0409': 'gemini-1.5',
      'gemini-pro-vision': 'gemini-pro-vision',
      'gemini-1.0': 'gemini',
      'gemini-pro': 'gemini',
    };

    Object.entries(expected).forEach(([model, expectedKey]) => {
      const valueKey = getValueKey(model, EModelEndpoint.google);
      expect(valueKey).toBe(expectedKey);
    });
  });

  it('should handle model names with different formats', () => {
    const testCases = [
      { input: 'google/gemini-pro', expected: 'gemini' },
      { input: 'gemini-pro/google', expected: 'gemini' },
      { input: 'google/gemini-2.0-flash-lite', expected: 'gemini-2.0-flash-lite' },
    ];

    testCases.forEach(({ input, expected }) => {
      const valueKey = getValueKey(input, EModelEndpoint.google);
      expect(valueKey).toBe(expected);
      expect(
        getMultiplier({ model: input, tokenType: 'prompt', endpoint: EModelEndpoint.google }),
      ).toBe(tokenValues[expected].prompt);
      expect(
        getMultiplier({ model: input, tokenType: 'completion', endpoint: EModelEndpoint.google }),
      ).toBe(tokenValues[expected].completion);
    });
  });
});

describe('Grok Model Tests - Pricing', () => {
  describe('getMultiplier', () => {
    test('should return correct prompt and completion rates for Grok vision models', () => {
      const models = ['grok-2-vision-1212', 'grok-2-vision', 'grok-2-vision-latest'];
      models.forEach((model) => {
        expect(getMultiplier({ model, tokenType: 'prompt' })).toBe(
          tokenValues['grok-2-vision'].prompt,
        );
        expect(getMultiplier({ model, tokenType: 'completion' })).toBe(
          tokenValues['grok-2-vision'].completion,
        );
      });
    });

    test('should return correct prompt and completion rates for Grok text models', () => {
      const models = ['grok-2-1212', 'grok-2', 'grok-2-latest'];
      models.forEach((model) => {
        expect(getMultiplier({ model, tokenType: 'prompt' })).toBe(tokenValues['grok-2'].prompt);
        expect(getMultiplier({ model, tokenType: 'completion' })).toBe(
          tokenValues['grok-2'].completion,
        );
      });
    });

    test('should return correct prompt and completion rates for Grok beta models', () => {
      expect(getMultiplier({ model: 'grok-vision-beta', tokenType: 'prompt' })).toBe(
        tokenValues['grok-vision-beta'].prompt,
      );
      expect(getMultiplier({ model: 'grok-vision-beta', tokenType: 'completion' })).toBe(
        tokenValues['grok-vision-beta'].completion,
      );
      expect(getMultiplier({ model: 'grok-beta', tokenType: 'prompt' })).toBe(
        tokenValues['grok-beta'].prompt,
      );
      expect(getMultiplier({ model: 'grok-beta', tokenType: 'completion' })).toBe(
        tokenValues['grok-beta'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 3 models', () => {
      expect(getMultiplier({ model: 'grok-3', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3'].prompt,
      );
      expect(getMultiplier({ model: 'grok-3', tokenType: 'completion' })).toBe(
        tokenValues['grok-3'].completion,
      );
      expect(getMultiplier({ model: 'grok-3-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-fast'].prompt,
      );
      expect(getMultiplier({ model: 'grok-3-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-fast'].completion,
      );
      expect(getMultiplier({ model: 'grok-3-mini', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-mini'].prompt,
      );
      expect(getMultiplier({ model: 'grok-3-mini', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-mini'].completion,
      );
      expect(getMultiplier({ model: 'grok-3-mini-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-mini-fast'].prompt,
      );
      expect(getMultiplier({ model: 'grok-3-mini-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-mini-fast'].completion,
      );
    });

    test('should return correct prompt and completion rates for Grok 3 models with prefixes', () => {
      expect(getMultiplier({ model: 'xai/grok-3', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-3', tokenType: 'completion' })).toBe(
        tokenValues['grok-3'].completion,
      );
      expect(getMultiplier({ model: 'xai/grok-3-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-fast'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-3-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-fast'].completion,
      );
      expect(getMultiplier({ model: 'xai/grok-3-mini', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-mini'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-3-mini', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-mini'].completion,
      );
      expect(getMultiplier({ model: 'xai/grok-3-mini-fast', tokenType: 'prompt' })).toBe(
        tokenValues['grok-3-mini-fast'].prompt,
      );
      expect(getMultiplier({ model: 'xai/grok-3-mini-fast', tokenType: 'completion' })).toBe(
        tokenValues['grok-3-mini-fast'].completion,
      );
    });
  });
});
