import {
  buildSandpackOptions,
  detectArtifactTypeFromFile,
  fileToArtifact,
  TOOL_ARTIFACT_TYPES,
} from '../artifacts';

const TAILWIND_CDN = 'https://cdn.tailwindcss.com/3.4.17#tailwind.js';

describe('buildSandpackOptions', () => {
  it('includes externalResources with .js fragment hint for static template', () => {
    const options = buildSandpackOptions('static');
    expect(options?.externalResources).toEqual([TAILWIND_CDN]);
  });

  it('includes externalResources for react-ts template', () => {
    const options = buildSandpackOptions('react-ts');
    expect(options?.externalResources).toEqual([TAILWIND_CDN]);
  });

  it('uses staticBundlerURL when template is static and config is provided', () => {
    const config = { staticBundlerURL: 'https://static.example.com' } as Parameters<
      typeof buildSandpackOptions
    >[1];
    const options = buildSandpackOptions('static', config);
    expect(options?.bundlerURL).toBe('https://static.example.com');
    expect(options?.externalResources).toEqual([TAILWIND_CDN]);
  });

  it('uses bundlerURL when template is react-ts and config is provided', () => {
    const config = { bundlerURL: 'https://bundler.example.com' } as Parameters<
      typeof buildSandpackOptions
    >[1];
    const options = buildSandpackOptions('react-ts', config);
    expect(options?.bundlerURL).toBe('https://bundler.example.com');
    expect(options?.externalResources).toEqual([TAILWIND_CDN]);
  });

  it('returns base options without bundlerURL when no config is provided', () => {
    const options = buildSandpackOptions('react-ts');
    expect(options?.bundlerURL).toBeUndefined();
  });
});

describe('detectArtifactTypeFromFile', () => {
  it.each([
    ['index.html', TOOL_ARTIFACT_TYPES.HTML],
    ['index.HTM', TOOL_ARTIFACT_TYPES.HTML],
    ['App.jsx', TOOL_ARTIFACT_TYPES.REACT],
    ['App.tsx', TOOL_ARTIFACT_TYPES.REACT],
    ['notes.md', TOOL_ARTIFACT_TYPES.MARKDOWN],
    ['notes.markdown', TOOL_ARTIFACT_TYPES.MARKDOWN],
    ['notes.mdx', TOOL_ARTIFACT_TYPES.MARKDOWN],
    ['flow.mmd', TOOL_ARTIFACT_TYPES.MERMAID],
    ['flow.mermaid', TOOL_ARTIFACT_TYPES.MERMAID],
    ['readme.txt', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
    ['report.docx', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
    ['notes.odt', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
    ['slides.pptx', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
  ])('classifies %s by extension', (filename, expected) => {
    expect(detectArtifactTypeFromFile({ filename, type: '', text: 'content' })).toBe(expected);
  });

  it('returns null when there is no text content', () => {
    expect(detectArtifactTypeFromFile({ filename: 'index.html', type: '', text: '' })).toBeNull();
    expect(
      detectArtifactTypeFromFile({ filename: 'index.html', type: '', text: undefined }),
    ).toBeNull();
  });

  it('falls back to MIME when the extension is unknown', () => {
    expect(detectArtifactTypeFromFile({ filename: 'noext', type: 'text/html', text: 'x' })).toBe(
      TOOL_ARTIFACT_TYPES.HTML,
    );
    expect(
      detectArtifactTypeFromFile({ filename: 'noext', type: 'text/markdown', text: 'x' }),
    ).toBe(TOOL_ARTIFACT_TYPES.MARKDOWN);
  });

  it.each([
    ['text/html; charset=utf-8', TOOL_ARTIFACT_TYPES.HTML],
    ['text/html;charset=utf-8', TOOL_ARTIFACT_TYPES.HTML],
    ['TEXT/HTML; CHARSET=UTF-8', TOOL_ARTIFACT_TYPES.HTML],
    ['text/markdown; charset=utf-8', TOOL_ARTIFACT_TYPES.MARKDOWN],
    ['application/vnd.react; foo=bar', TOOL_ARTIFACT_TYPES.REACT],
  ])('strips MIME parameters before lookup (%s)', (mime, expected) => {
    expect(detectArtifactTypeFromFile({ filename: 'noext', type: mime, text: 'x' })).toBe(expected);
  });

  it.each([
    ['application/vnd.react'],
    ['application/vnd.ant.react'],
    ['application/vnd.mermaid'],
    ['application/vnd.code-html'],
  ])('routes %s by MIME alone', (mime) => {
    const result = detectArtifactTypeFromFile({ filename: 'noext', type: mime, text: 'x' });
    expect(result).not.toBeNull();
  });

  it('returns null for unsupported types', () => {
    expect(
      detectArtifactTypeFromFile({ filename: 'output.csv', type: 'text/csv', text: 'a,b' }),
    ).toBeNull();
    expect(
      detectArtifactTypeFromFile({ filename: 'doc.pdf', type: 'application/pdf', text: 'x' }),
    ).toBeNull();
  });
});

describe('fileToArtifact', () => {
  const baseFile = {
    file_id: 'fid-1',
    filename: 'index.html',
    type: 'text/html',
    text: '<h1>hi</h1>',
    messageId: 'msg-1',
    updatedAt: '2026-04-26T10:00:00.000Z',
  };

  it('builds an Artifact for supported files, with stable id derived from file_id', () => {
    const artifact = fileToArtifact(baseFile);
    expect(artifact).not.toBeNull();
    expect(artifact!.id).toBe('tool-artifact-fid-1');
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.HTML);
    expect(artifact!.title).toBe('index.html');
    expect(artifact!.content).toBe('<h1>hi</h1>');
    expect(artifact!.messageId).toBe('msg-1');
    expect(artifact!.lastUpdateTime).toBe(new Date(baseFile.updatedAt).getTime());
  });

  it('returns null for unsupported types so callers can fall through', () => {
    expect(fileToArtifact({ ...baseFile, filename: 'data.csv', type: 'text/csv' })).toBeNull();
  });

  it('returns null when there is no text content', () => {
    expect(fileToArtifact({ ...baseFile, text: '' })).toBeNull();
  });

  it('falls back to createdAt when updatedAt is missing', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      updatedAt: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(artifact!.lastUpdateTime).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });

  it('falls back to filename when file_id is missing', () => {
    const artifact = fileToArtifact({ ...baseFile, file_id: undefined as unknown as string });
    expect(artifact!.id).toBe('tool-artifact-index.html');
  });
});
