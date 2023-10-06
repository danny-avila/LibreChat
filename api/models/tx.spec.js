const { getValueKey, getMultiplier, defaultRate } = require('./tx');

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
});

describe('getMultiplier', () => {
  it('should return the correct multiplier for a given valueKey and tokenType', () => {
    expect(getMultiplier({ valueKey: '8k', tokenType: 'prompt' })).toBe(3);
    expect(getMultiplier({ valueKey: '8k', tokenType: 'completion' })).toBe(6);
  });

  it('should return defaultRate if tokenType is provided but not found in tokenValues', () => {
    expect(getMultiplier({ valueKey: '8k', tokenType: 'unknownType' })).toBe(defaultRate);
  });

  it('should derive the valueKey from the model if not provided', () => {
    expect(getMultiplier({ tokenType: 'prompt', model: 'gpt-4-some-other-info' })).toBe(3);
  });

  it('should return 1 if only model or tokenType is missing', () => {
    expect(getMultiplier({ tokenType: 'prompt' })).toBe(1);
    expect(getMultiplier({ model: 'gpt-4-some-other-info' })).toBe(1);
  });

  it('should return defaultRate if derived valueKey does not match any known patterns', () => {
    expect(getMultiplier({ tokenType: 'prompt', model: 'gpt-5-some-other-info' })).toBe(
      defaultRate,
    );
  });
});
