import {
  sanitizeFilename,
  sanitizeArtifactPath,
  flattenArtifactPath,
  resolveUploadErrorMessage,
} from './files';

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

describe('sanitizeArtifactPath', () => {
  test('preserves a single nested directory component', () => {
    expect(sanitizeArtifactPath('test_folder/test_file.txt')).toBe('test_folder/test_file.txt');
  });

  test('preserves multiple nested directory components', () => {
    expect(sanitizeArtifactPath('a/b/c/file.txt')).toBe('a/b/c/file.txt');
  });

  test('replaces non-alphanumeric characters per segment', () => {
    expect(sanitizeArtifactPath('proj name/file@v1.txt')).toBe('proj_name/file_v1.txt');
  });

  test('falls back to basename for parent traversal', () => {
    expect(sanitizeArtifactPath('../escape.txt')).toBe('escape.txt');
  });

  test('falls back to basename for embedded parent traversal', () => {
    expect(sanitizeArtifactPath('a/../escape.txt')).toBe('escape.txt');
  });

  test('falls back to basename for absolute paths', () => {
    expect(sanitizeArtifactPath('/abs/path.txt')).toBe('path.txt');
  });

  test('collapses redundant separators', () => {
    expect(sanitizeArtifactPath('dir//file.txt')).toBe('dir/file.txt');
  });

  test('strips current-directory segments', () => {
    expect(sanitizeArtifactPath('./dir/./file.txt')).toBe('dir/file.txt');
  });

  test('prepends underscore only on the leaf when it starts with a dot', () => {
    expect(sanitizeArtifactPath('dir/.hidden')).toBe('dir/_.hidden');
  });

  test('returns underscore for empty input', () => {
    expect(sanitizeArtifactPath('')).toBe('_');
  });

  test('caps the leaf segment at 255 chars with extension-preserving truncation', () => {
    /* Regression for the unbounded-leaf path: without the per-segment
     * cap, a 300-char artifact name would flow through to saveBuffer's
     * storage key (`${file_id}__${flatName}`) and trip ENAMETOOLONG on
     * filesystems that enforce NAME_MAX. The mocked `randomBytes`
     * returns `abc123`, so the truncated form is deterministic. */
    const longName = 'a'.repeat(300) + '.txt';
    const result = sanitizeArtifactPath(longName);
    expect(result.length).toBe(255);
    expect(result).toMatch(/^a+-abc123\.txt$/);
  });

  test('caps the leaf when nested under a directory, preserving the directory verbatim', () => {
    const longLeaf = 'b'.repeat(300) + '.csv';
    const result = sanitizeArtifactPath(`reports/${longLeaf}`);
    const [dir, leaf] = result.split('/');
    expect(dir).toBe('reports');
    expect(leaf.length).toBe(255);
    expect(leaf).toMatch(/^b+-abc123\.csv$/);
  });

  test('caps non-leaf directory segments at 255 chars', () => {
    /* Directory components hit `NAME_MAX` independently of the leaf —
     * each `mkdir` along the path has to satisfy the per-component limit
     * regardless of the basename truncation. */
    const longDir = 'd'.repeat(300);
    const result = sanitizeArtifactPath(`${longDir}/notes.txt`);
    const [dir, leaf] = result.split('/');
    expect(dir.length).toBe(255);
    expect(dir).toMatch(/^d+-abc123$/);
    expect(leaf).toBe('notes.txt');
  });

  test('caps every segment in a deeply-nested path with mixed lengths', () => {
    /* Every segment respects the cap — the truncate is per-component,
     * not on the join. This is what protects against pathological
     * generated paths like `<huge-prompt>/<huge-prompt>/file.csv`. */
    const segA = 'x'.repeat(260);
    const segB = 'y'.repeat(260);
    const leaf = 'z'.repeat(260) + '.json';
    const result = sanitizeArtifactPath(`${segA}/${segB}/${leaf}`);
    const parts = result.split('/');
    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBe(255);
    expect(parts[1].length).toBe(255);
    expect(parts[2].length).toBe(255);
    expect(parts[2]).toMatch(/\.json$/);
  });

  test('does not truncate filenames that are exactly at the 255-char limit', () => {
    /* Off-by-one guard: 255 itself is allowed (filesystem boundary), 256
     * is not. */
    const exact = 'e'.repeat(251) + '.txt'; // 255 chars total
    expect(sanitizeArtifactPath(exact)).toBe(exact);
    expect(sanitizeArtifactPath(`dir/${exact}`)).toBe(`dir/${exact}`);
  });

  test('preserves the dotfile underscore prefix when the leaf also needs truncation', () => {
    /* A long hidden-file leaf (`._very_long_name`) goes through the
     * underscore-prefix branch first; truncation must run AFTER that
     * rewrite or the leaf would still leak past the cap. */
    const longHidden = '.' + 'a'.repeat(300);
    const result = sanitizeArtifactPath(`dir/${longHidden}`);
    const [dir, leaf] = result.split('/');
    expect(dir).toBe('dir');
    expect(leaf.length).toBe(255);
    expect(leaf.startsWith('_.')).toBe(true);
  });
});

describe('flattenArtifactPath', () => {
  test('joins path components with __ for storage keys', () => {
    expect(flattenArtifactPath('a/b/c.txt')).toBe('a__b__c.txt');
  });

  test('passes through paths with no separator', () => {
    expect(flattenArtifactPath('file.txt')).toBe('file.txt');
  });

  test('handles single-level nesting', () => {
    expect(flattenArtifactPath('test_folder/test_file.txt')).toBe('test_folder__test_file.txt');
  });

  test('passes through unchanged when no maxLength is supplied', () => {
    /* The cap is opt-in — callers that aren't building filesystem keys
     * (e.g. tests, log messages) shouldn't get truncation. */
    const longPath = 'a'.repeat(200) + '/' + 'b'.repeat(200) + '.txt';
    expect(flattenArtifactPath(longPath)).toBe(longPath.replace(/\//g, '__'));
  });

  test('passes through unchanged when flat form fits within maxLength', () => {
    expect(flattenArtifactPath('short/file.txt', 100)).toBe('short__file.txt');
    expect(flattenArtifactPath('short/file.txt', 15)).toBe('short__file.txt');
  });

  test('truncates flat form when it exceeds maxLength, preserving leaf extension', () => {
    /* Regression for the deep-nesting flat-key overflow path: three
     * 100-char segments → 308-char flat form that would blow past
     * NAME_MAX=255 once `${file_id}__` is prepended. The truncation
     * keeps the .ext on the leaf so download MIME inference still works. */
    const a = 'a'.repeat(100);
    const b = 'b'.repeat(100);
    const result = flattenArtifactPath(`${a}/${b}/c.txt`, 200);
    expect(result.length).toBe(200);
    expect(result.endsWith('.txt')).toBe(true);
    expect(result).toMatch(/-abc123\.txt$/);
  });

  test('preserves the extension even when only the leaf overflows', () => {
    const longLeaf = 'L'.repeat(300);
    const result = flattenArtifactPath(`${longLeaf}.json`, 200);
    expect(result.length).toBe(200);
    expect(result.endsWith('.json')).toBe(true);
  });

  test('falls back to whole-key truncation (no extension preservation) when ext is pathologically long', () => {
    /* `path.extname`-style logic: a single dot followed by 100 chars is
     * not a real extension. Keep the cap honored even if a contrived
     * input would yield a "stem budget" of zero or negative. */
    const result = flattenArtifactPath('stem.' + 'x'.repeat(100), 50);
    expect(result.length).toBe(50);
  });

  test('handles paths with no extension by truncating the stem', () => {
    const longName = 'n'.repeat(300);
    const result = flattenArtifactPath(longName, 50);
    expect(result.length).toBe(50);
    expect(result).toMatch(/-abc123$/);
  });

  test('matches the boundary length exactly when input is right at the cap', () => {
    /* Off-by-one guard: maxLength of N should allow flat forms of N. */
    const flat = 'a'.repeat(50);
    expect(flattenArtifactPath(flat, 50)).toBe(flat);
    expect(flattenArtifactPath(flat, 49).length).toBe(49);
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
