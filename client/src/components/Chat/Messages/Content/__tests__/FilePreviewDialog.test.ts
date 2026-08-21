import { FileSources } from 'librechat-data-provider';
import { getDownloadFilename, getPreviewKind } from '../preview';

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
});
