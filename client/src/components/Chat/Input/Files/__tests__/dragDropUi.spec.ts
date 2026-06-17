import { formatFileSize, getDragDropFileIcon } from '../dragDropUi';

describe('dragDropUi', () => {
  it('formats byte sizes for display', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('classifies file icons by mime type', () => {
    expect(getDragDropFileIcon('photo.png', 'image/png')).toBe('image');
    expect(getDragDropFileIcon('doc.pdf', 'application/pdf')).toBe('document');
    expect(getDragDropFileIcon('data.bin', 'application/octet-stream')).toBe('generic');
  });
});
