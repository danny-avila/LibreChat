const { getValueKey, getMultiplier, defaultRate, tokenValues } = require('./tx');

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
    expect(getValueKey('gpt-4o-2024-05-13')).toBe('gpt-4o');
    expect(getValueKey('openai/gpt-4o')).toBe('gpt-4o');
    expect(getValueKey('gpt-4o-turbo')).toBe('gpt-4o');
    expect(getValueKey('gpt-4o-0125')).toBe('gpt-4o');
  });

  it('should return "gpt-4o-mini" for model type of "gpt-4o-mini"', () => {
    expect(getValueKey('gpt-4o-mini-2024-07-18')).toBe('gpt-4o-mini');
    expect(getValueKey('openai/gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(getValueKey('gpt-4o-mini-0718')).toBe('gpt-4o-mini');
    expect(getValueKey('gpt-4o-2024-08-06-0718')).not.toBe('gpt-4o');
  });

  it('should return "gpt-4o-2024-08-06" for model type of "gpt-4o-2024-08-06"', () => {
    expect(getValueKey('gpt-4o-2024-08-06-2024-07-18')).toBe('gpt-4o-2024-08-06');
    expect(getValueKey('openai/gpt-4o-2024-08-06')).toBe('gpt-4o-2024-08-06');
    expect(getValueKey('gpt-4o-2024-08-06-0718')).toBe('gpt-4o-2024-08-06');
    expect(getValueKey('gpt-4o-2024-08-06-0718')).not.toBe('gpt-4o');
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
    const valueKey = getValueKey('gpt-4o-2024-05-13');
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
      const multiplier = getMultiplier({ valueKey: model, tokenType: 'prompt' });
      return multiplier === tokenValues[model].prompt;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct completion multipliers for all models', () => {
    const results = awsModels.map((model) => {
      const multiplier = getMultiplier({ valueKey: model, tokenType: 'completion' });
      return multiplier === tokenValues[model].completion;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct prompt multipliers for all models with Bedrock prefix', () => {
    const results = awsModels.map((model) => {
      const modelName = `bedrock/${model}`;
      const multiplier = getMultiplier({ valueKey: modelName, tokenType: 'prompt' });
      return multiplier === tokenValues[model].prompt;
    });
    expect(results.every(Boolean)).toBe(true);
  });

  it('should return the correct completion multipliers for all models with Bedrock prefix', () => {
    const results = awsModels.map((model) => {
      const modelName = `bedrock/${model}`;
      const multiplier = getMultiplier({ valueKey: modelName, tokenType: 'completion' });
      return multiplier === tokenValues[model].completion;
    });
    expect(results.every(Boolean)).toBe(true);
  });
});
