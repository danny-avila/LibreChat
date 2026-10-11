import { findPullRequestLink } from './links';

describe('findPullRequestLink', () => {
  it('finds the pull request `gh pr create` prints', () => {
    const output =
      'Creating pull request for feat/x into dev in o/r\n\nhttps://github.com/o/r/pull/42\n';
    expect(findPullRequestLink(output, 'o/r')).toBe(42);
  });

  it('matches the repository without case, as GitHub does', () => {
    expect(findPullRequestLink('https://github.com/Owner/Repo/pull/5', 'owner/repo')).toBe(5);
  });

  it('takes the last link to the repository when there are several', () => {
    const output = 'see https://github.com/o/r/pull/3 then https://github.com/o/r/pull/8.';
    expect(findPullRequestLink(output, 'o/r')).toBe(8);
  });

  it('accepts a link to a page of the pull request', () => {
    expect(findPullRequestLink('https://github.com/o/r/pull/12/files', 'o/r')).toBe(12);
  });

  it('accepts trailing punctuation after the number', () => {
    expect(findPullRequestLink('(https://github.com/o/r/pull/12)', 'o/r')).toBe(12);
  });

  it.each([
    ['another repository', 'https://github.com/other/r/pull/4'],
    ['a repository that only starts the same', 'https://github.com/o/r-fork/pull/4'],
    ['an issue', 'https://github.com/o/r/issues/4'],
    ['the page git push suggests', 'https://github.com/o/r/pull/new/feat/x'],
    ['another host', 'https://example.com/o/r/pull/4'],
    ['plain http', 'http://github.com/o/r/pull/4'],
    ['a number glued to more text', 'https://github.com/o/r/pull/4abc'],
    ['pull request zero', 'https://github.com/o/r/pull/0'],
    ['a bare number', 'opened #4'],
  ])('ignores %s', (_, output) => {
    expect(findPullRequestLink(output, 'o/r')).toBeNull();
  });

  it('ignores a number too large to be a pull request', () => {
    expect(findPullRequestLink(`https://github.com/o/r/pull/${'9'.repeat(20)}`, 'o/r')).toBeNull();
  });
});
