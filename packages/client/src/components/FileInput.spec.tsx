import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FileInput, FILE_TYPE_MAP } from './FileInput';
import type { FileType } from './FileInput';

describe('FILE_TYPE_MAP', () => {
  it('contains all expected file types', () => {
    const expectedTypes: FileType[] = [
      'image',
      'document',
      'video',
      'audio',
      'image_document',
      'image_document_video_audio',
      'all',
    ];
    for (const type of expectedTypes) {
      expect(FILE_TYPE_MAP).toHaveProperty(type);
      expect(typeof FILE_TYPE_MAP[type]).toBe('string');
    }
  });

  it('maps image type to image wildcards with HEIF/HEIC', () => {
    expect(FILE_TYPE_MAP.image).toBe('image/*,.heif,.heic');
  });

  it('maps document type to PDF and office extensions', () => {
    expect(FILE_TYPE_MAP.document).toContain('.pdf');
    expect(FILE_TYPE_MAP.document).toContain('application/pdf');
    expect(FILE_TYPE_MAP.document).toContain('.doc');
    expect(FILE_TYPE_MAP.document).toContain('.xlsx');
  });

  it('maps image_document to combined image and PDF types', () => {
    expect(FILE_TYPE_MAP.image_document).toContain('image/*');
    expect(FILE_TYPE_MAP.image_document).toContain('application/pdf');
  });

  it('maps image_document_video_audio to all media types', () => {
    const value = FILE_TYPE_MAP.image_document_video_audio;
    expect(value).toContain('image/*');
    expect(value).toContain('video/*');
    expect(value).toContain('audio/*');
    expect(value).toContain('application/pdf');
  });

  it('maps all to wildcard', () => {
    expect(FILE_TYPE_MAP.all).toBe('*');
  });
});

describe('FileInput', () => {
  it('renders an input with type="file"', () => {
    const { container } = render(<FileInput />);
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('type', 'file');
  });

  it('sets accept from a predefined type', () => {
    const { container } = render(<FileInput acceptTypes={['image']} />);
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('accept', FILE_TYPE_MAP.image);
  });

  it('sets accept from multiple predefined types', () => {
    const { container } = render(<FileInput acceptTypes={['image', 'document']} />);
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('accept', `${FILE_TYPE_MAP.image},${FILE_TYPE_MAP.document}`);
  });

  it('passes through custom MIME types', () => {
    const { container } = render(<FileInput acceptTypes={['image/png', 'application/json']} />);
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('accept', 'image/png,application/json');
  });

  it('mixes predefined and custom types', () => {
    const { container } = render(<FileInput acceptTypes={['image', 'application/json']} />);
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('accept', `${FILE_TYPE_MAP.image},application/json`);
  });

  it('omits accept when no types provided', () => {
    const { container } = render(<FileInput />);
    const input = container.querySelector('input');
    expect(input).not.toHaveAttribute('accept');
  });

  it('defaults multiple to false', () => {
    const { container } = render(<FileInput />);
    const input = container.querySelector('input');
    expect(input).not.toHaveAttribute('multiple');
  });

  it('sets multiple when specified', () => {
    const { container } = render(<FileInput multiple />);
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('multiple');
  });

  it('forwards ref to input element', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<FileInput ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.type).toBe('file');
  });

  it('passes through additional HTML attributes', () => {
    const { container } = render(
      <FileInput data-testid="file-input" style={{ display: 'none' }} />,
    );
    const input = container.querySelector('input');
    expect(input).toHaveAttribute('data-testid', 'file-input');
    expect(input).toHaveStyle({ display: 'none' });
  });
});
