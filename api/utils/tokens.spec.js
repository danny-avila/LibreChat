const { getModelMaxTokens } = require('./tokens');

describe('getModelMaxTokens', () => {
  test('should return correct tokens for exact match', () => {
    expect(getModelMaxTokens('gpt-4-32k-0613')).toBe(32767);
  });

  test('should return correct tokens for partial match', () => {
    expect(getModelMaxTokens('gpt-4-32k-unknown')).toBe(32767);
  });

  test('should return correct tokens for partial match (OpenRouter)', () => {
    expect(getModelMaxTokens('openai/gpt-4-32k')).toBe(32767);
  });

  test('should return undefined for no match', () => {
    expect(getModelMaxTokens('unknown-model')).toBeUndefined();
  });

  test('should return correct tokens for another exact match', () => {
    expect(getModelMaxTokens('gpt-3.5-turbo-16k-0613')).toBe(15999);
  });

  test('should return correct tokens for another partial match', () => {
    expect(getModelMaxTokens('gpt-3.5-turbo-unknown')).toBe(4095);
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
});
