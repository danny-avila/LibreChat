import type { TAttachment } from 'librechat-data-provider';
import { isImageAttachment, isTextAttachment } from '../attachmentTypes';

const baseAttachment = (overrides: Partial<TAttachment> = {}): TAttachment =>
  ({
    file_id: 'file-1',
    filename: 'unset',
    filepath: '/files/file-1',
    type: 'application/octet-stream',
    ...overrides,
  }) as TAttachment;

describe('isImageAttachment', () => {
  it('returns true for image filenames with width, height, and filepath', () => {
    const attachment = baseAttachment({
      filename: 'chart.png',
      width: 800,
      height: 600,
      filepath: '/files/chart.png',
    } as Partial<TAttachment>);
    expect(isImageAttachment(attachment)).toBe(true);
  });

  it('returns false when filename is missing', () => {
    const attachment = baseAttachment({ filename: undefined as unknown as string });
    expect(isImageAttachment(attachment)).toBe(false);
  });

  it('returns false for non-image extensions', () => {
    const attachment = baseAttachment({
      filename: 'notes.txt',
      width: 800,
      height: 600,
    } as Partial<TAttachment>);
    expect(isImageAttachment(attachment)).toBe(false);
  });

  it('returns false when width is missing', () => {
    const attachment = baseAttachment({
      filename: 'chart.png',
      height: 600,
    } as Partial<TAttachment>);
    expect(isImageAttachment(attachment)).toBe(false);
  });

  it('returns false when height is missing', () => {
    const attachment = baseAttachment({
      filename: 'chart.png',
      width: 800,
    } as Partial<TAttachment>);
    expect(isImageAttachment(attachment)).toBe(false);
  });

  it('returns false when filepath is null', () => {
    const attachment = baseAttachment({
      filename: 'chart.png',
      width: 800,
      height: 600,
      filepath: null as unknown as string,
    } as Partial<TAttachment>);
    expect(isImageAttachment(attachment)).toBe(false);
  });
});

describe('isTextAttachment', () => {
  it('returns true when text is a non-empty string', () => {
    const attachment = baseAttachment({
      filename: 'output.csv',
      text: 'a,b,c\n1,2,3',
    } as Partial<TAttachment>);
    expect(isTextAttachment(attachment)).toBe(true);
  });

  it('returns false when text is missing', () => {
    expect(isTextAttachment(baseAttachment({ filename: 'output.csv' }))).toBe(false);
  });

  it('returns false when text is an empty string', () => {
    const attachment = baseAttachment({
      filename: 'empty.txt',
      text: '',
    } as Partial<TAttachment>);
    expect(isTextAttachment(attachment)).toBe(false);
  });

  it('returns false when text is non-string (e.g. null)', () => {
    const attachment = baseAttachment({
      filename: 'broken.txt',
      text: null as unknown as string,
    } as Partial<TAttachment>);
    expect(isTextAttachment(attachment)).toBe(false);
  });
});
