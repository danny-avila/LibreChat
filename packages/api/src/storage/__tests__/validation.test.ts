import { assertPathSegment, sanitizeContentDispositionFilename } from '../validation';

describe('assertPathSegment', () => {
  it('returns safe single path segments', () => {
    expect(assertPathSegment('userId', 'user123', 'test')).toBe('user123');
  });

  it('rejects empty, slash, traversal, and control-character segments', () => {
    expect(() => assertPathSegment('userId', '', 'test')).toThrow('must not be empty');
    expect(() => assertPathSegment('userId', 'user/123', 'test')).toThrow(
      'must not contain slashes',
    );
    expect(() => assertPathSegment('userId', '..', 'test')).toThrow(
      'must not contain path traversal',
    );
    expect(() => assertPathSegment('userId', 'tenant..legacy', 'test')).toThrow(
      'must not contain path traversal',
    );
    expect(() => assertPathSegment('userId', 'user\u0000id', 'test')).toThrow(
      'contains unsafe path characters',
    );
    expect(() => assertPathSegment('userId', 'user\u007fid', 'test')).toThrow(
      'contains unsafe path characters',
    );
  });
});

describe('sanitizeContentDispositionFilename', () => {
  it('strips quoted-string and header separator characters', () => {
    expect(sanitizeContentDispositionFilename('report";\\\r\nbad.pdf')).toBe('reportbad.pdf');
  });
});
