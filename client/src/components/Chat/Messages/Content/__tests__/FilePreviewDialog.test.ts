import { FileSources } from 'librechat-data-provider';
import { getPreviewKind, shouldUseSharedFileDownload } from '../preview';
import { getDownloadFilename } from '~/utils/downloadFile';

describe('FilePreviewDialog text-source behavior', () => {
  it('previews extracted PDF content as text', () => {
    expect(getPreviewKind('report.pdf', 'application/pdf', FileSources.text)).toBe('text');
  });

  it('downloads extracted content with a text extension', () => {
    expect(getDownloadFilename('report.pdf', 'file-1', FileSources.text)).toBe('report.pdf.txt');
    expect(getDownloadFilename('notes.txt', 'file-2', FileSources.text)).toBe('notes.txt');
  });

  it('preserves the original behavior for stored files', () => {
    expect(getPreviewKind('report.pdf', 'application/pdf', FileSources.local)).toBe('pdf');
    expect(getDownloadFilename('report.pdf', 'file-3', FileSources.local)).toBe('report.pdf');
  });

  it('routes any identified file through the share boundary in a shared view', () => {
    expect(shouldUseSharedFileDownload('share-1', 'file-1')).toBe(true);
    expect(shouldUseSharedFileDownload('share-1', undefined)).toBe(false);
    expect(shouldUseSharedFileDownload(undefined, 'file-1')).toBe(false);
  });
});
