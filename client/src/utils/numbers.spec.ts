import { sanitizeIntegerInput } from './numbers';

describe('sanitizeIntegerInput', () => {
  test('strips US-style thousands separators', () => {
    expect(sanitizeIntegerInput('120,000')).toBe('120000');
  });

  test('strips EU-style thousands separators', () => {
    expect(sanitizeIntegerInput('120.000')).toBe('120000');
  });

  test('strips spaces and other grouping characters', () => {
    expect(sanitizeIntegerInput('1 200 000')).toBe('1200000');
  });

  test('drops stray non-numeric characters', () => {
    expect(sanitizeIntegerInput('12a3')).toBe('123');
    expect(sanitizeIntegerInput('abc')).toBe('');
  });

  test('preserves an empty string so the field can be cleared', () => {
    expect(sanitizeIntegerInput('')).toBe('');
  });

  test('leaves a clean integer untouched', () => {
    expect(sanitizeIntegerInput('120000')).toBe('120000');
  });
});
