import type { TAttachment } from 'librechat-data-provider';
import {
  artifactTypeForAttachment,
  isImageAttachment,
  isMermaidArtifact,
  isPanelArtifact,
  isTextAttachment,
} from '../attachmentTypes';

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

describe('artifactTypeForAttachment', () => {
  it.each([
    ['index.html', 'text/html'],
    ['site.htm', 'text/html'],
    ['App.jsx', 'application/vnd.react'],
    ['App.tsx', 'application/vnd.react'],
    ['notes.md', 'text/markdown'],
    ['readme.markdown', 'text/markdown'],
    ['flow.mmd', 'application/vnd.mermaid'],
    ['flow.mermaid', 'application/vnd.mermaid'],
  ])('classifies %s as %s', (filename, expected) => {
    const attachment = baseAttachment({
      filename,
      text: 'content',
    } as Partial<TAttachment>);
    expect(artifactTypeForAttachment(attachment)).toBe(expected);
  });

  it('falls back to MIME for HTML when extension is missing', () => {
    const attachment = baseAttachment({
      filename: 'noext',
      type: 'text/html',
      text: 'content',
    } as unknown as Partial<TAttachment>);
    expect(artifactTypeForAttachment(attachment)).toBe('text/html');
  });

  it('returns null when there is no text content', () => {
    const attachment = baseAttachment({ filename: 'index.html' });
    expect(artifactTypeForAttachment(attachment)).toBeNull();
  });

  it('returns null for unsupported extensions', () => {
    const attachment = baseAttachment({
      filename: 'data.csv',
      text: 'a,b,c',
    } as Partial<TAttachment>);
    expect(artifactTypeForAttachment(attachment)).toBeNull();
  });
});

describe('isMermaidArtifact / isPanelArtifact', () => {
  it('routes mermaid to isMermaidArtifact, not isPanelArtifact', () => {
    const attachment = baseAttachment({
      filename: 'flow.mmd',
      text: 'graph TD\nA-->B',
    } as Partial<TAttachment>);
    expect(isMermaidArtifact(attachment)).toBe(true);
    expect(isPanelArtifact(attachment)).toBe(false);
  });

  it('routes html/jsx/markdown to isPanelArtifact, not isMermaidArtifact', () => {
    const html = baseAttachment({
      filename: 'index.html',
      text: '<h1>hi</h1>',
    } as Partial<TAttachment>);
    expect(isPanelArtifact(html)).toBe(true);
    expect(isMermaidArtifact(html)).toBe(false);

    const jsx = baseAttachment({
      filename: 'App.tsx',
      text: 'export default () => null;',
    } as Partial<TAttachment>);
    expect(isPanelArtifact(jsx)).toBe(true);

    const md = baseAttachment({
      filename: 'notes.md',
      text: '# hi',
    } as Partial<TAttachment>);
    expect(isPanelArtifact(md)).toBe(true);
  });

  it('returns false for both when there is no text', () => {
    const attachment = baseAttachment({ filename: 'index.html' });
    expect(isPanelArtifact(attachment)).toBe(false);
    expect(isMermaidArtifact(attachment)).toBe(false);
  });
});
