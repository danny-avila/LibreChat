import { LocalFilePathError, parseRelativePath } from './path';

describe('parseRelativePath', () => {
  it('returns empty segments for empty or whitespace paths', () => {
    expect(parseRelativePath('')).toEqual([]);
    expect(parseRelativePath('   ')).toEqual([]);
  });

  it('normalizes backslashes and accepts nested relative paths', () => {
    expect(parseRelativePath('notes\\drafts\\readme.md')).toEqual(['notes', 'drafts', 'readme.md']);
  });

  it('rejects absolute paths', () => {
    expect(() => parseRelativePath('/etc/passwd')).toThrow(LocalFilePathError);
  });

  it('rejects parent-directory traversal', () => {
    expect(() => parseRelativePath('../secret.txt')).toThrow(LocalFilePathError);
    expect(() => parseRelativePath('notes/../../secret.txt')).toThrow(LocalFilePathError);
  });

  it('treats dot paths as the connected folder root', () => {
    expect(parseRelativePath('.')).toEqual([]);
    expect(parseRelativePath('./')).toEqual([]);
    expect(parseRelativePath('./notes.txt')).toEqual(['notes.txt']);
    expect(parseRelativePath('notes/./drafts/readme.md')).toEqual(['notes', 'drafts', 'readme.md']);
  });
});
