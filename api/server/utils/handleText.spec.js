const { isEnabled } = require('./handleText');

describe('isEnabled', () => {
  test('should return true when input is "true"', () => {
    expect(isEnabled('true')).toBe(true);
  });

  test('should return true when input is "TRUE"', () => {
    expect(isEnabled('TRUE')).toBe(true);
  });

  test('should return true when input is true', () => {
    expect(isEnabled(true)).toBe(true);
  });

  test('should return false when input is "false"', () => {
    expect(isEnabled('false')).toBe(false);
  });

  test('should return false when input is false', () => {
    expect(isEnabled(false)).toBe(false);
  });

  test('should return false when input is null', () => {
    expect(isEnabled(null)).toBe(false);
  });

  test('should return false when input is undefined', () => {
    expect(isEnabled()).toBe(false);
  });

  test('should return false when input is an empty string', () => {
    expect(isEnabled('')).toBe(false);
  });

  test('should return false when input is a whitespace string', () => {
    expect(isEnabled('   ')).toBe(false);
  });

  test('should return false when input is a number', () => {
    expect(isEnabled(123)).toBe(false);
  });

  test('should return false when input is an object', () => {
    expect(isEnabled({})).toBe(false);
  });

  test('should return false when input is an array', () => {
    expect(isEnabled([])).toBe(false);
  });
});
