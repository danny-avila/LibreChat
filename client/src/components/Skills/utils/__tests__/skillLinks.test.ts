import { isExternalSkillLink, splitHrefHash, resolveSkillRelativePath } from '../skillLinks';

describe('isExternalSkillLink', () => {
  it('treats empty hrefs as external', () => {
    expect(isExternalSkillLink('')).toBe(true);
  });

  it.each([
    ['http://example.com'],
    ['https://example.com/path'],
    ['mailto:user@example.com'],
    ['tel:+12025550100'],
    ['//cdn.example.com/script.js'],
    ['/skills/abc'],
    ['#anchor'],
  ])('flags %s as external', (href) => {
    expect(isExternalSkillLink(href)).toBe(true);
  });

  it.each([
    ['references/notes.md'],
    ['./sibling.md'],
    ['../other/file.md'],
    ['nested/deep/page.md'],
  ])('treats %s as internal', (href) => {
    expect(isExternalSkillLink(href)).toBe(false);
  });
});

describe('splitHrefHash', () => {
  it('returns the full href and empty hash when no fragment is present', () => {
    expect(splitHrefHash('references/notes.md')).toEqual({
      path: 'references/notes.md',
      hash: '',
    });
  });

  it('splits a hash fragment from the path', () => {
    expect(splitHrefHash('references/notes.md#section')).toEqual({
      path: 'references/notes.md',
      hash: '#section',
    });
  });

  it('handles a hash-only href by leaving the path empty', () => {
    expect(splitHrefHash('#top')).toEqual({ path: '', hash: '#top' });
  });
});

describe('resolveSkillRelativePath', () => {
  it('resolves from the skill root when no current file is given', () => {
    expect(resolveSkillRelativePath('references/notes.md')).toBe('references/notes.md');
  });

  it('resolves a sibling relative to the current file directory', () => {
    expect(resolveSkillRelativePath('sibling.md', 'references/source-selection.md')).toBe(
      'references/sibling.md',
    );
  });

  it('treats `./foo` the same as `foo`', () => {
    expect(resolveSkillRelativePath('./sibling.md', 'references/source.md')).toBe(
      'references/sibling.md',
    );
  });

  it('walks up the tree with `..`', () => {
    expect(resolveSkillRelativePath('../other.md', 'references/source.md')).toBe('other.md');
  });

  it('cannot escape the skill root with extra `..` segments', () => {
    expect(resolveSkillRelativePath('../../../escaped.md', 'references/source.md')).toBe(
      'escaped.md',
    );
  });

  it('drops empty segments produced by adjacent separators', () => {
    expect(resolveSkillRelativePath('references//notes.md')).toBe('references/notes.md');
  });

  it('resolves relative to SKILL.md at the bundle root', () => {
    expect(resolveSkillRelativePath('references/source-selection.md', 'SKILL.md')).toBe(
      'references/source-selection.md',
    );
  });
});
