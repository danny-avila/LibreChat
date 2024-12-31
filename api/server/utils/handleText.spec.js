const { isEnabled, sanitizeFilename } = require('./handleText');

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

jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue(Buffer.from('abc123', 'hex')),
}));

describe('sanitizeFilename', () => {
  test('removes directory components (1/2)', () => {
    expect(sanitizeFilename('/path/to/file.txt')).toBe('file.txt');
  });

  test('removes directory components (2/2)', () => {
    expect(sanitizeFilename('../../../../file.txt')).toBe('file.txt');
  });

  test('replaces non-alphanumeric characters', () => {
    expect(sanitizeFilename('file name@#$.txt')).toBe('file_name___.txt');
  });

  test('preserves dots and hyphens', () => {
    expect(sanitizeFilename('file-name.with.dots.txt')).toBe('file-name.with.dots.txt');
  });

  test('prepends underscore to filenames starting with a dot', () => {
    expect(sanitizeFilename('.hiddenfile')).toBe('_.hiddenfile');
  });

  test('truncates long filenames', () => {
    const longName = 'a'.repeat(300) + '.txt';
    const result = sanitizeFilename(longName);
    expect(result.length).toBe(255);
    expect(result).toMatch(/^a+-abc123\.txt$/);
  });

  test('handles filenames with no extension', () => {
    const longName = 'a'.repeat(300);
    const result = sanitizeFilename(longName);
    expect(result.length).toBe(255);
    expect(result).toMatch(/^a+-abc123$/);
  });

  test('handles empty input', () => {
    expect(sanitizeFilename('')).toBe('_');
  });

  test('handles input with only special characters', () => {
    expect(sanitizeFilename('@#$%^&*')).toBe('_______');
  });
});
