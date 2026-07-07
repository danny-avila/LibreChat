import { findEntryName, tryDecodeFileName } from './resolve';

describe('local file name resolution', () => {
  const entries = ['Screenshot 2026-05-07 at 8.56.21 AM.png', 'notes.txt', 'README.md'];

  it('matches exact file names including spaces', () => {
    expect(findEntryName(entries, 'Screenshot 2026-05-07 at 8.56.21 AM.png')).toBe(
      'Screenshot 2026-05-07 at 8.56.21 AM.png',
    );
  });

  it('matches case-insensitively', () => {
    expect(findEntryName(entries, 'NOTES.TXT')).toBe('notes.txt');
  });

  it('decodes percent-encoded spaces', () => {
    expect(tryDecodeFileName('Screenshot%202026-05-07.png')).toBe('Screenshot 2026-05-07.png');
    expect(findEntryName(['Screenshot 2026-05-07.png'], 'Screenshot%202026-05-07.png')).toBe(
      'Screenshot 2026-05-07.png',
    );
  });

  it('returns null when no entry matches', () => {
    expect(findEntryName(entries, 'missing.png')).toBeNull();
  });
});
