import { sanitizeModelParameters, NUMERIC_MODEL_PARAM_KEYS } from '../src/agents';

describe('sanitizeModelParameters', () => {
  test('returns an empty object when the input is null or undefined', () => {
    expect(sanitizeModelParameters(null)).toEqual({});
    expect(sanitizeModelParameters(undefined)).toEqual({});
  });

  test('preserves non-numeric keys verbatim', () => {
    const out = sanitizeModelParameters({
      temperature: 0.7,
      top_p: 0.95,
      model: 'gpt-4',
      useResponsesApi: true,
    });
    expect(out).toEqual({
      temperature: 0.7,
      top_p: 0.95,
      model: 'gpt-4',
      useResponsesApi: true,
    });
  });

  test('drops numeric keys that carry a non-numeric string (the "System" placeholder bug)', () => {
    const out = sanitizeModelParameters({
      max_tokens: 'System',
      maxContextTokens: 'Système',
      maxOutputTokens: 'システム',
      temperature: 0.7,
    });
    expect(out.max_tokens).toBeUndefined();
    expect(out.maxContextTokens).toBeUndefined();
    expect(out.maxOutputTokens).toBeUndefined();
    expect(out.temperature).toBe(0.7);
  });

  test('coerces numeric strings to numbers for known numeric keys', () => {
    const out = sanitizeModelParameters({
      max_tokens: '4096',
      maxContextTokens: '262144',
      fileTokenLimit: '256000',
    });
    expect(out.max_tokens).toBe(4096);
    expect(out.maxContextTokens).toBe(262144);
    expect(out.fileTokenLimit).toBe(256000);
  });

  test('drops numeric keys that yield NaN, Infinity, or non-positive values', () => {
    const out = sanitizeModelParameters({
      max_tokens: NaN,
      maxContextTokens: Infinity,
      maxOutputTokens: 0,
      max_output_tokens: -100,
      fileTokenLimit: 'not-a-number',
    });
    expect(Object.keys(out)).toHaveLength(0);
  });

  test('passes through valid positive numeric values without change', () => {
    const out = sanitizeModelParameters({
      max_tokens: 4096,
      maxTokens: 8192,
      maxContextTokens: 262144,
      max_context_tokens: 262144,
      max_output_tokens: 4096,
      maxOutputTokens: 4096,
      fileTokenLimit: 256000,
    });
    expect(out).toEqual({
      max_tokens: 4096,
      maxTokens: 8192,
      maxContextTokens: 262144,
      max_context_tokens: 262144,
      max_output_tokens: 4096,
      maxOutputTokens: 4096,
      fileTokenLimit: 256000,
    });
  });

  test('NUMERIC_MODEL_PARAM_KEYS covers every snake_case and camelCase variant we sanitize', () => {
    expect(NUMERIC_MODEL_PARAM_KEYS.has('max_tokens')).toBe(true);
    expect(NUMERIC_MODEL_PARAM_KEYS.has('maxTokens')).toBe(true);
    expect(NUMERIC_MODEL_PARAM_KEYS.has('max_context_tokens')).toBe(true);
    expect(NUMERIC_MODEL_PARAM_KEYS.has('maxContextTokens')).toBe(true);
    expect(NUMERIC_MODEL_PARAM_KEYS.has('max_output_tokens')).toBe(true);
    expect(NUMERIC_MODEL_PARAM_KEYS.has('maxOutputTokens')).toBe(true);
    expect(NUMERIC_MODEL_PARAM_KEYS.has('fileTokenLimit')).toBe(true);
  });
});
