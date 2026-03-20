import { sanitizeFilename, resolveUploadErrorMessage } from './files';

jest.mock('node:crypto', () => {
  const actualModule = jest.requireActual('node:crypto');
  return {
    ...actualModule,
    randomBytes: jest.fn().mockReturnValue(Buffer.from('abc123', 'hex')),
  };
});

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

describe('resolveUploadErrorMessage', () => {
  test('returns default message for null error', () => {
    expect(resolveUploadErrorMessage(null)).toBe('Error processing file');
  });

  test('returns default message for undefined error', () => {
    expect(resolveUploadErrorMessage(undefined)).toBe('Error processing file');
  });

  test('returns default message when error has no message property', () => {
    expect(resolveUploadErrorMessage({})).toBe('Error processing file');
  });

  test('returns default message for unrecognized error', () => {
    expect(resolveUploadErrorMessage({ message: 'ENOENT: no such file or directory' })).toBe(
      'Error processing file',
    );
  });

  test('prepends default message for file_ids errors', () => {
    expect(resolveUploadErrorMessage({ message: 'max file_ids reached' })).toBe(
      'Error processing file: max file_ids reached',
    );
  });

  test('surfaces "Invalid file format" errors', () => {
    expect(resolveUploadErrorMessage({ message: 'Invalid file format: .xyz' })).toBe(
      'Invalid file format: .xyz',
    );
  });

  test('surfaces "exceeds token limit" errors', () => {
    expect(resolveUploadErrorMessage({ message: 'Content exceeds token limit' })).toBe(
      'Content exceeds token limit',
    );
  });

  test('surfaces "Unable to extract text from" errors', () => {
    const msg = 'Unable to extract text from "doc.pdf". The document may be image-based.';
    expect(resolveUploadErrorMessage({ message: msg })).toBe(msg);
  });

  test('accepts a custom default message', () => {
    expect(resolveUploadErrorMessage(null, 'Custom default')).toBe('Custom default');
  });

  test('uses custom default in file_ids prepend', () => {
    expect(resolveUploadErrorMessage({ message: 'file_ids limit' }, 'Upload failed')).toBe(
      'Upload failed: file_ids limit',
    );
  });
});

describe('sanitizeFilename with real crypto', () => {
  // Temporarily unmock crypto for these tests
  beforeAll(() => {
    jest.resetModules();
    jest.unmock('node:crypto');
  });

  afterAll(() => {
    jest.resetModules();
    jest.mock('node:crypto', () => {
      const actualModule = jest.requireActual('node:crypto');
      return {
        ...actualModule,
        randomBytes: jest.fn().mockReturnValue(Buffer.from('abc123', 'hex')),
      };
    });
  });

  test('truncates long filenames with real crypto', async () => {
    const { sanitizeFilename: realSanitizeFilename } = await import('./files');
    const longName = 'b'.repeat(300) + '.pdf';
    const result = realSanitizeFilename(longName);

    expect(result.length).toBe(255);
    expect(result).toMatch(/^b+-[a-f0-9]{6}\.pdf$/);
    expect(result.endsWith('.pdf')).toBe(true);
  });

  test('handles filenames with no extension with real crypto', async () => {
    const { sanitizeFilename: realSanitizeFilename } = await import('./files');
    const longName = 'c'.repeat(300);
    const result = realSanitizeFilename(longName);

    expect(result.length).toBe(255);
    expect(result).toMatch(/^c+-[a-f0-9]{6}$/);
    expect(result).not.toContain('.');
  });

  test('generates unique suffixes for identical long filenames', async () => {
    const { sanitizeFilename: realSanitizeFilename } = await import('./files');
    const longName = 'd'.repeat(300) + '.doc';
    const result1 = realSanitizeFilename(longName);
    const result2 = realSanitizeFilename(longName);

    expect(result1.length).toBe(255);
    expect(result2.length).toBe(255);
    expect(result1).not.toBe(result2); // Should be different due to random suffix
    expect(result1.endsWith('.doc')).toBe(true);
    expect(result2.endsWith('.doc')).toBe(true);
  });

  test('real crypto produces valid hex strings', async () => {
    const { sanitizeFilename: realSanitizeFilename } = await import('./files');
    const longName = 'test'.repeat(100) + '.txt';
    const result = realSanitizeFilename(longName);

    const hexMatch = result.match(/-([a-f0-9]{6})\.txt$/);
    expect(hexMatch).toBeTruthy();
    expect(hexMatch![1]).toMatch(/^[a-f0-9]{6}$/);
  });
});
