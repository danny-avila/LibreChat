import { getDownloadFilename } from '../download';

describe('getDownloadFilename', () => {
  it('prefers and decodes the RFC 5987 filename', () => {
    expect(
      getDownloadFilename(
        `attachment; filename="r_sum_.txt"; filename*=UTF-8''r%C3%A9sum%C3%A9.txt`,
      ),
    ).toBe('résumé.txt');
  });

  it('falls back to the quoted filename', () => {
    expect(getDownloadFilename('attachment; filename="report.txt"')).toBe('report.txt');
  });

  it('unescapes quotes and backslashes in the quoted filename', () => {
    expect(getDownloadFilename('attachment; filename="a\\"b\\\\c.txt"')).toBe('a"b\\c.txt');
  });

  it('uses the plain filename when the extended value is malformed', () => {
    expect(
      getDownloadFilename(`attachment; filename="report.txt"; filename*=UTF-8''bad%ZZname`),
    ).toBe('report.txt');
  });

  it('returns undefined when no filename is present', () => {
    expect(getDownloadFilename('attachment')).toBeUndefined();
    expect(getDownloadFilename(undefined)).toBeUndefined();
  });
});
