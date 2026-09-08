import { resolveDownloadPath } from '../path';

describe('resolveDownloadPath', () => {
  it('prefers the recorded object key over the stored URL', () => {
    expect(
      resolveDownloadPath({
        filepath: 'https://bucket.s3.amazonaws.com/uploads/u1/f.pdf?X-Amz-Expires=900',
        storageKey: 'uploads/u1/f.pdf',
      }),
    ).toBe('uploads/u1/f.pdf');
  });

  it('falls back to the path when no key was recorded', () => {
    expect(resolveDownloadPath({ filepath: '/uploads/u1/f.pdf' })).toBe('/uploads/u1/f.pdf');
  });

  it('treats an empty or null key as absent', () => {
    expect(resolveDownloadPath({ filepath: '/uploads/u1/f.pdf', storageKey: '' })).toBe(
      '/uploads/u1/f.pdf',
    );
    expect(resolveDownloadPath({ filepath: '/uploads/u1/f.pdf', storageKey: null })).toBe(
      '/uploads/u1/f.pdf',
    );
  });

  it('keeps a remote URL intact for strategies that fetch it directly', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/f.pdf?alt=media&token=t';
    expect(resolveDownloadPath({ filepath: url })).toBe(url);
  });
});
