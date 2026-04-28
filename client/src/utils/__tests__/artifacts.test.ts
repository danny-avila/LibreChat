import {
  buildSandpackOptions,
  detectArtifactTypeFromFile,
  fileToArtifact,
  languageForFilename,
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

  it.each([
    ['index.html', TOOL_ARTIFACT_TYPES.HTML],
    ['App.tsx', TOOL_ARTIFACT_TYPES.REACT],
    ['flow.mmd', TOOL_ARTIFACT_TYPES.MERMAID],
  ])('returns null when %s has no text (%s viewer needs real content)', (filename) => {
    expect(detectArtifactTypeFromFile({ filename, type: '', text: '' })).toBeNull();
    expect(detectArtifactTypeFromFile({ filename, type: '', text: undefined })).toBeNull();
  });

  it.each([
    ['readme.txt', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
    ['slides.pptx', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
    ['report.docx', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
    ['notes.md', TOOL_ARTIFACT_TYPES.MARKDOWN],
  ])(
    'still routes %s through the panel without text (deferred-extraction case)',
    (filename, expected) => {
      expect(detectArtifactTypeFromFile({ filename, type: '', text: '' })).toBe(expected);
      expect(detectArtifactTypeFromFile({ filename, type: '', text: undefined })).toBe(expected);
    },
  );

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

  it('does not route bare text/plain MIME without a recognized extension', () => {
    // Files with text/plain MIME and an unrecognized name (extensionless
    // scripts, .env, etc.) should keep the inline <pre> rendering, not
    // hijack the artifact panel.
    expect(
      detectArtifactTypeFromFile({ filename: 'unknown', type: 'text/plain', text: 'x' }),
    ).toBeNull();
    expect(
      detectArtifactTypeFromFile({ filename: '.env', type: 'text/plain', text: 'KEY=value' }),
    ).toBeNull();
  });

  describe('CODE bucket (programming-language source files)', () => {
    /* `.py` and other code files were previously inline-only — PR #12832
     * intentionally left them out of the side-panel pipeline. This bucket
     * routes them through the markdown template with the source pre-
     * wrapped as a fenced code block (`useArtifactProps`). */
    it.each([
      ['simple_graph.py', 'text/x-python'],
      ['app.js', 'text/javascript'],
      ['main.go', 'text/x-go'],
      ['lib.rs', 'text/x-rust'],
      ['style.css', 'text/css'],
      ['build.sh', 'application/x-sh'],
      ['query.sql', 'application/sql'],
      ['Module.kt', 'text/x-kotlin'],
    ])('routes %s (mime: %s) to the CODE bucket', (filename, type) => {
      expect(detectArtifactTypeFromFile({ filename, type, text: 'x = 1' })).toBe(
        TOOL_ARTIFACT_TYPES.CODE,
      );
    });

    it('routes by extension even when MIME is generic octet-stream', () => {
      /* file-type / inferMimeType sometimes can't classify code files
       * (Python has no magic bytes); the extension map still wins. */
      expect(
        detectArtifactTypeFromFile({
          filename: 'data.py',
          type: 'application/octet-stream',
          text: 'print(1)',
        }),
      ).toBe(TOOL_ARTIFACT_TYPES.CODE);
    });

    it('keeps jsx/tsx on the React (sandpack) bucket, not CODE', () => {
      /* `.jsx` and `.tsx` are React component sources — the existing
       * sandpack live-preview should win over the static CODE bucket. */
      expect(detectArtifactTypeFromFile({ filename: 'App.jsx', type: '', text: 'x' })).toBe(
        TOOL_ARTIFACT_TYPES.REACT,
      );
      expect(detectArtifactTypeFromFile({ filename: 'App.tsx', type: '', text: 'x' })).toBe(
        TOOL_ARTIFACT_TYPES.REACT,
      );
    });

    it('does NOT route data formats to CODE (CSV / JSON / YAML / TOML / XML)', () => {
      /* These get dedicated viewers in follow-ups; for now they fall
       * through to inline rendering (return null). */
      expect(
        detectArtifactTypeFromFile({ filename: 'data.csv', type: 'text/csv', text: 'a,b' }),
      ).toBeNull();
      expect(
        detectArtifactTypeFromFile({ filename: 'data.json', type: 'application/json', text: '{}' }),
      ).toBeNull();
      expect(
        detectArtifactTypeFromFile({
          filename: 'config.yaml',
          type: 'application/yaml',
          text: 'a: 1',
        }),
      ).toBeNull();
      expect(
        detectArtifactTypeFromFile({
          filename: 'pyproject.toml',
          type: 'application/toml',
          text: '',
        }),
      ).toBeNull();
    });

    it('does NOT route config dotfiles to CODE (.env / .ini)', () => {
      expect(
        detectArtifactTypeFromFile({ filename: 'app.env', type: 'text/plain', text: 'KEY=val' }),
      ).toBeNull();
      expect(
        detectArtifactTypeFromFile({
          filename: 'config.ini',
          type: 'text/plain',
          text: '[section]',
        }),
      ).toBeNull();
    });

    it('allows empty text for CODE files (an empty Python file is still a Python file)', () => {
      expect(
        detectArtifactTypeFromFile({ filename: 'empty.py', type: 'text/x-python', text: '' }),
      ).toBe(TOOL_ARTIFACT_TYPES.CODE);
    });

    /* Codex review P2: extensionless build files like `Dockerfile` and
     * `Makefile` have no `.` in their basename, so `extensionOf` returns
     * `''` and the extension map can't match. Bare-name fallback
     * recognizes the lowercased basename for these cases. */
    it.each([
      'Dockerfile',
      'dockerfile',
      'Makefile',
      'makefile',
      'Gemfile',
      'Rakefile',
      'Vagrantfile',
      'Brewfile',
    ])('routes extensionless build file %s to CODE via bare-name fallback', (filename) => {
      expect(detectArtifactTypeFromFile({ filename, type: '', text: 'FROM alpine' })).toBe(
        TOOL_ARTIFACT_TYPES.CODE,
      );
    });

    it('still recognizes nested-path Dockerfile (path-preserving sanitizer output)', () => {
      /* The path-preserving artifact sanitizer can ship `proj/Dockerfile`.
       * Bare-name lookup must use the basename, not the full string. */
      expect(
        detectArtifactTypeFromFile({ filename: 'proj/Dockerfile', type: '', text: 'FROM alpine' }),
      ).toBe(TOOL_ARTIFACT_TYPES.CODE);
    });

    it('does not bare-name match files that DO have an extension (no double-match)', () => {
      /* `dockerfile.dev` has extension `dev` (not in the routing map),
       * so it returns null. Bare-name lookup must skip files with a
       * `.` so the extension path stays the source of truth for them. */
      expect(
        detectArtifactTypeFromFile({ filename: 'dockerfile.dev', type: '', text: 'x' }),
      ).toBeNull();
    });

    it('does not bare-name match unknown extensionless filenames', () => {
      expect(detectArtifactTypeFromFile({ filename: 'README', type: '', text: 'hi' })).toBeNull();
      expect(detectArtifactTypeFromFile({ filename: 'LICENSE', type: '', text: 'MIT' })).toBeNull();
    });

    /* Codex review P3 companion: `extensionOf` used to consider the
     * whole path string, so `pkg.v1/Dockerfile` yielded a path-laden
     * "extension" that masked the bare-name fallback. The basename-
     * first fix makes routing for these files work correctly. */
    it('routes nested-path Dockerfile under dotted directory to CODE', () => {
      expect(
        detectArtifactTypeFromFile({ filename: 'pkg.v1/Dockerfile', type: '', text: 'FROM x' }),
      ).toBe(TOOL_ARTIFACT_TYPES.CODE);
    });

    it('still routes file extensions correctly under dotted directory', () => {
      expect(
        detectArtifactTypeFromFile({ filename: 'pkg.v1/main.go', type: '', text: 'package main' }),
      ).toBe(TOOL_ARTIFACT_TYPES.CODE);
      expect(
        detectArtifactTypeFromFile({
          filename: 'a.b.c/script.py',
          type: 'text/x-python',
          text: 'x = 1',
        }),
      ).toBe(TOOL_ARTIFACT_TYPES.CODE);
    });
  });
});

describe('languageForFilename', () => {
  it('returns the canonical language identifier for known extensions', () => {
    expect(languageForFilename('foo.py')).toBe('python');
    expect(languageForFilename('foo.ts')).toBe('typescript');
    expect(languageForFilename('foo.go')).toBe('go');
    expect(languageForFilename('foo.rs')).toBe('rust');
    expect(languageForFilename('foo.kt')).toBe('kotlin');
  });

  it('falls back to the raw extension for unknown ones (renders monospace)', () => {
    expect(languageForFilename('foo.qwerty')).toBe('qwerty');
  });

  it('returns the canonical language for extensionless build files (bare-name fallback)', () => {
    /* Codex review P2 companion: language hint must follow the same
     * bare-name fallback as the routing decision so the fenced block
     * gets `language-dockerfile` / `language-makefile` etc. */
    expect(languageForFilename('Dockerfile')).toBe('dockerfile');
    expect(languageForFilename('Makefile')).toBe('makefile');
    expect(languageForFilename('Gemfile')).toBe('ruby');
    expect(languageForFilename('Rakefile')).toBe('ruby');
  });

  it('handles nested-path filenames (uses basename)', () => {
    expect(languageForFilename('proj/Dockerfile')).toBe('dockerfile');
    expect(languageForFilename('a/b/c.py')).toBe('python');
  });

  it('returns empty string for filenames with no extension and no recognized bare name', () => {
    expect(languageForFilename('README')).toBe('');
    expect(languageForFilename('')).toBe('');
    expect(languageForFilename(undefined)).toBe('');
  });

  /* Codex review P3: `extensionOf` previously took `lastIndexOf('.')`
   * across the FULL path, so `pkg.v1/Dockerfile` yielded the
   * nonsensical "extension" `v1/dockerfile`. Since that's non-empty,
   * `languageForFilename` returned it as the language hint instead of
   * falling back to `bareNameOf`. The basename-first fix makes both
   * helpers operate on the basename only. */
  it('correctly falls back to bare-name when path has dotted directory components', () => {
    expect(languageForFilename('pkg.v1/Dockerfile')).toBe('dockerfile');
    expect(languageForFilename('a.b.c/Makefile')).toBe('makefile');
    expect(languageForFilename('proj.beta/Gemfile')).toBe('ruby');
  });

  it('correctly identifies extension when path has dotted directory components', () => {
    /* Dotted dir + dotted file: extension parsing should still find
     * the file's extension, not concatenate dir+file fragments. */
    expect(languageForFilename('pkg.v1/main.go')).toBe('go');
    expect(languageForFilename('a.b.c/script.py')).toBe('python');
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

  it('returns null when an HTML/React/Mermaid file has no text', () => {
    expect(fileToArtifact({ ...baseFile, text: '' })).toBeNull();
    expect(fileToArtifact({ ...baseFile, filename: 'App.tsx', type: '', text: '' })).toBeNull();
    expect(fileToArtifact({ ...baseFile, filename: 'flow.mmd', type: '', text: '' })).toBeNull();
  });

  it('uses the caller-provided placeholder when a deferred-extraction file has no text', () => {
    // Backend extractor returns null for pptx (deferred). Client sees
    // `text === null` and substitutes the localized placeholder.
    const artifact = fileToArtifact(
      {
        ...baseFile,
        filename: 'slides.pptx',
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        text: null as unknown as string,
      },
      { placeholder: '_Coming soon_' },
    );
    expect(artifact).not.toBeNull();
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.PLAIN_TEXT);
    expect(artifact!.content).toBe('_Coming soon_');
  });

  it('falls back to empty content when no placeholder is supplied and text is missing', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'slides.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      text: undefined,
    });
    expect(artifact!.content).toBe('');
  });

  it('preserves an empty string as legitimate content (does not fall through to placeholder)', () => {
    // A user can write a 0-byte `.md` or `.txt`; that's a valid artifact
    // with empty content, not "extraction unavailable."
    const artifact = fileToArtifact(
      { ...baseFile, filename: 'empty.md', type: 'text/markdown', text: '' },
      { placeholder: '_should not appear_' },
    );
    expect(artifact!.content).toBe('');
  });

  it('uses real text when present for deferred-extraction file types', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'slides.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      text: 'Slide 1: Intro\nSlide 2: Outro',
    });
    expect(artifact!.content).toBe('Slide 1: Intro\nSlide 2: Outro');
  });

  it('skips re-classification when preClassifiedType is provided', () => {
    // Filename would normally classify as html, but caller forces plain-text.
    const artifact = fileToArtifact(
      { ...baseFile, filename: 'index.html', type: 'text/html', text: 'x' },
      { preClassifiedType: TOOL_ARTIFACT_TYPES.PLAIN_TEXT },
    );
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.PLAIN_TEXT);
  });

  it.each([[TOOL_ARTIFACT_TYPES.HTML], [TOOL_ARTIFACT_TYPES.REACT], [TOOL_ARTIFACT_TYPES.MERMAID]])(
    'returns null when preClassifiedType=%s is paired with empty text (defense in depth)',
    (preClassifiedType) => {
      // Bypassing classification with a strict-viewer type but no text
      // would otherwise hand sandpack/mermaid.js an empty buffer that
      // throws. Internal guard catches it before construction.
      const artifact = fileToArtifact(
        { ...baseFile, filename: 'whatever', type: '', text: '' },
        { preClassifiedType },
      );
      expect(artifact).toBeNull();
    },
  );

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
