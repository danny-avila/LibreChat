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
