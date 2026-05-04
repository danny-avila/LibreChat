import {
  buildSandpackOptions,
  detectArtifactTypeFromFile,
  fileToArtifact,
  isPreviewOnlyArtifact,
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
    ['notes.odt', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
    ['report.docx', TOOL_ARTIFACT_TYPES.DOCX],
    ['data.csv', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['workbook.xlsx', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['legacy.xls', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['sheet.ods', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['slides.pptx', TOOL_ARTIFACT_TYPES.PRESENTATION],
  ])('classifies %s by extension', (filename, expected) => {
    expect(detectArtifactTypeFromFile({ filename, type: '', text: 'content' })).toBe(expected);
  });

  it.each([
    ['index.html', TOOL_ARTIFACT_TYPES.HTML],
    ['App.tsx', TOOL_ARTIFACT_TYPES.REACT],
    ['flow.mmd', TOOL_ARTIFACT_TYPES.MERMAID],
    /* Office preview buckets need server-rendered HTML in `text` to render
     * — the empty-text gate keeps the artifact off the panel until the
     * backend's `bufferToOfficeHtml` finishes. */
    ['report.docx', TOOL_ARTIFACT_TYPES.DOCX],
    ['data.csv', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['workbook.xlsx', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['slides.pptx', TOOL_ARTIFACT_TYPES.PRESENTATION],
  ])('returns null when %s has no text (renderer needs real content)', (filename, _expected) => {
    expect(detectArtifactTypeFromFile({ filename, type: '', text: '' })).toBeNull();
    expect(detectArtifactTypeFromFile({ filename, type: '', text: undefined })).toBeNull();
  });

  it.each([
    ['readme.txt', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
    ['notes.md', TOOL_ARTIFACT_TYPES.MARKDOWN],
    ['notes.odt', TOOL_ARTIFACT_TYPES.PLAIN_TEXT],
  ])(
    'still routes %s through the panel without text (deferred-extraction case for plain-text/markdown)',
    (filename, expected) => {
      expect(detectArtifactTypeFromFile({ filename, type: '', text: '' })).toBe(expected);
      expect(detectArtifactTypeFromFile({ filename, type: '', text: undefined })).toBe(expected);
    },
  );

  it.each([
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      TOOL_ARTIFACT_TYPES.DOCX,
    ],
    [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      TOOL_ARTIFACT_TYPES.SPREADSHEET,
    ],
    ['application/vnd.ms-excel', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['application/vnd.oasis.opendocument.spreadsheet', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['text/csv', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    ['application/csv', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    /* Legacy CSV MIME variant — backend's `CSV_MIME_PATTERN` accepts
     * it, so the client must too or extensionless CSVs with this MIME
     * would be skipped despite the backend producing valid HTML.
     * Regression for Codex P3 review on PR #12934. */
    ['text/comma-separated-values', TOOL_ARTIFACT_TYPES.SPREADSHEET],
    [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      TOOL_ARTIFACT_TYPES.PRESENTATION,
    ],
  ])('routes office MIME %s to its preview bucket when extension is missing', (mime, expected) => {
    expect(
      detectArtifactTypeFromFile({ filename: 'noext', type: mime, text: '<html>x</html>' }),
    ).toBe(expected);
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
    /* PDFs have no rich preview path on the client (the artifact panel
     * doesn't host a PDF viewer); they fall back to the download UI. */
    expect(
      detectArtifactTypeFromFile({ filename: 'doc.pdf', type: 'application/pdf', text: 'x' }),
    ).toBeNull();
    expect(
      detectArtifactTypeFromFile({ filename: 'photo.jpg', type: 'image/jpeg', text: 'binary' }),
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

    it('does NOT route data formats to CODE (JSON / YAML / TOML / XML)', () => {
      /* These get dedicated viewers in follow-ups; for now they fall
       * through to inline rendering (return null). CSV is the exception:
       * it routes to the SPREADSHEET preview bucket — covered separately
       * in the "classifies %s by extension" suite above. */
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

  /* Codex review P3: when a file routes to CODE via MIME-only (e.g.
   * `noext` filename + `text/x-python` MIME), we still want a language
   * hint on the fenced block so the future highlighter swap-in can
   * apply syntax colors. Without the MIME fallback, `language-` is
   * empty and the highlighter can't engage. */
  it('falls back to MIME when filename has no extension and no recognized bare name', () => {
    expect(languageForFilename('noext', 'text/x-python')).toBe('python');
    expect(languageForFilename('noext', 'text/x-go')).toBe('go');
    expect(languageForFilename('noext', 'application/x-sh')).toBe('bash');
    expect(languageForFilename(undefined, 'text/x-rust')).toBe('rust');
  });

  it('strips MIME parameters before lookup (charset, etc.)', () => {
    expect(languageForFilename('noext', 'text/x-python; charset=utf-8')).toBe('python');
    expect(languageForFilename('noext', 'TEXT/X-PYTHON;charset=utf-8')).toBe('python');
  });

  it('prefers extension over MIME when both are present (extension is more reliable)', () => {
    /* `simple_graph.py` + a wrong/generic MIME → extension wins. */
    expect(languageForFilename('simple_graph.py', 'application/octet-stream')).toBe('python');
    expect(languageForFilename('main.go', 'text/x-python')).toBe('go');
  });

  it('prefers bare-name over MIME for build files', () => {
    /* `Dockerfile` + a generic MIME → bare-name wins. */
    expect(languageForFilename('Dockerfile', 'text/plain')).toBe('dockerfile');
  });

  it('returns empty string when no signal yields a hint (extensionless + unknown MIME)', () => {
    expect(languageForFilename('noext', 'application/octet-stream')).toBe('');
    expect(languageForFilename('noext', undefined)).toBe('');
    expect(languageForFilename('noext')).toBe('');
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
    expect(fileToArtifact({ ...baseFile, filename: 'photo.jpg', type: 'image/jpeg' })).toBeNull();
    expect(
      fileToArtifact({ ...baseFile, filename: 'doc.pdf', type: 'application/pdf' }),
    ).toBeNull();
  });

  /* End-to-end test for the CODE bucket. The classification path is
   * covered separately in `detectArtifactTypeFromFile`'s describe block;
   * this asserts that the full `Artifact` object (id / type / title /
   * content / messageId / lastUpdateTime) is constructed correctly for
   * a typical Python file. Locks in the empty-text gate exception for
   * CODE and the title pass-through that `useArtifactProps` reads to
   * derive the language hint. */
  it('builds a CODE-typed Artifact for a .py file with text', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'simple_graph.py',
      type: 'text/x-python',
      text: 'import matplotlib.pyplot as plt\nplt.savefig("foo.png")',
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.CODE);
    expect(artifact!.title).toBe('simple_graph.py');
    expect(artifact!.content).toBe('import matplotlib.pyplot as plt\nplt.savefig("foo.png")');
    expect(artifact!.id).toBe('tool-artifact-fid-1');
    expect(artifact!.messageId).toBe('msg-1');
  });

  it('builds a CODE-typed Artifact for an empty .py file (empty-text exception applies)', () => {
    /* CODE joins MARKDOWN/PLAIN_TEXT in the empty-text exception so an
     * empty Python file still surfaces in the side panel rather than
     * silently disappearing. */
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'empty.py',
      type: 'text/x-python',
      text: '',
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.CODE);
    expect(artifact!.content).toBe('');
  });

  it('builds a CODE-typed Artifact for an extensionless build file (Dockerfile)', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'Dockerfile',
      type: '',
      text: 'FROM alpine\nRUN apk add curl',
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.CODE);
    expect(artifact!.title).toBe('Dockerfile');
    /* Bare-name resolved → `dockerfile` language hint stored on the
     * artifact so `useArtifactProps` doesn't have to re-derive it. */
    expect(artifact!.language).toBe('dockerfile');
  });

  /* Codex review P3: language is resolved AT CONSTRUCTION TIME so the
   * MIME fallback fires for extensionless filenames. Without storing
   * the language on the artifact, `useArtifactProps` would re-derive
   * from `artifact.title` alone (which has no MIME context) and emit
   * an empty `language-` class. */
  it('stores the language hint on CODE artifacts (filename-derived)', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'app.py',
      type: 'text/x-python',
      text: 'print(1)',
    });
    expect(artifact!.language).toBe('python');
  });

  it('stores the MIME-derived language on CODE artifacts when filename has no extension', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'noext',
      type: 'text/x-python',
      text: 'print(1)',
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.CODE);
    expect(artifact!.language).toBe('python');
  });

  it('does not set language on non-CODE artifacts', () => {
    /* Markdown / HTML / etc. don't need a language hint — `useArtifactProps`
     * uses different rendering paths for those. Keeping `language`
     * undefined for them avoids confusing `getKey` which does include
     * `language` in its cache key. */
    const html = fileToArtifact(baseFile);
    expect(html!.language).toBeUndefined();
    const md = fileToArtifact({
      ...baseFile,
      filename: 'README.md',
      type: 'text/markdown',
      text: '# hi',
    });
    expect(md!.language).toBeUndefined();
  });

  it('returns null when an HTML/React/Mermaid file has no text', () => {
    expect(fileToArtifact({ ...baseFile, text: '' })).toBeNull();
    expect(fileToArtifact({ ...baseFile, filename: 'App.tsx', type: '', text: '' })).toBeNull();
    expect(fileToArtifact({ ...baseFile, filename: 'flow.mmd', type: '', text: '' })).toBeNull();
  });

  it('uses the caller-provided placeholder when a deferred-extraction file has no text', () => {
    /* Plain-text and markdown remain on the lenient empty-text gate so the
     * artifact card can render a "preparing preview…" placeholder while
     * extraction is in flight. (Office preview buckets — DOCX, SPREADSHEET,
     * PRESENTATION — use the strict gate instead: their renderers need
     * server-rendered HTML, so the artifact stays unregistered until the
     * `text` field arrives. See the strict-gate test in the
     * `detectArtifactTypeFromFile` suite.) */
    const artifact = fileToArtifact(
      {
        ...baseFile,
        filename: 'notes.txt',
        type: 'text/plain',
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
      filename: 'notes.txt',
      type: 'text/plain',
      text: undefined,
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.content).toBe('');
  });

  it('returns null for office preview buckets without text (strict gate)', () => {
    expect(
      fileToArtifact({
        ...baseFile,
        filename: 'slides.pptx',
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        text: undefined,
      }),
    ).toBeNull();
    expect(
      fileToArtifact({
        ...baseFile,
        filename: 'report.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        text: '',
      }),
    ).toBeNull();
    expect(
      fileToArtifact({
        ...baseFile,
        filename: 'data.csv',
        type: 'text/csv',
        text: undefined,
      }),
    ).toBeNull();
  });

  it('builds a SPREADSHEET artifact for csv/xlsx with backend-rendered HTML in text', () => {
    const csv = fileToArtifact({
      ...baseFile,
      filename: 'data.csv',
      type: 'text/csv',
      text: '<!DOCTYPE html><table><tr><td>1</td></tr></table>',
    });
    expect(csv).not.toBeNull();
    expect(csv!.type).toBe(TOOL_ARTIFACT_TYPES.SPREADSHEET);
    expect(csv!.title).toBe('data.csv');
    expect(csv!.content).toContain('<table>');

    const xlsx = fileToArtifact({
      ...baseFile,
      filename: 'workbook.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      text: '<!DOCTYPE html><body>sheet</body>',
    });
    expect(xlsx).not.toBeNull();
    expect(xlsx!.type).toBe(TOOL_ARTIFACT_TYPES.SPREADSHEET);
  });

  it('builds a DOCX artifact for .docx with backend-rendered HTML in text', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'report.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      text: '<!DOCTYPE html><body><p>hello</p></body>',
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.DOCX);
  });

  it('builds a PRESENTATION artifact for .pptx with backend-rendered HTML in text', () => {
    const artifact = fileToArtifact({
      ...baseFile,
      filename: 'deck.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      text: '<!DOCTYPE html><body><ol><li>Slide 1</li></ol></body>',
    });
    expect(artifact).not.toBeNull();
    expect(artifact!.type).toBe(TOOL_ARTIFACT_TYPES.PRESENTATION);
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

describe('isPreviewOnlyArtifact', () => {
  /* The Artifacts panel hides the "code" tab and snaps `activeTab` to
   * 'preview' when the current artifact is preview-only — i.e. the
   * underlying file is binary and the generated HTML blob isn't a
   * useful "code" view. Regression for review finding #6 on PR #12934.
   * Without this test, removing a type from the predicate (or adding a
   * non-office type) would silently leave users seeing the raw HTML
   * blob in the code tab. */
  it.each([
    [TOOL_ARTIFACT_TYPES.DOCX, true],
    [TOOL_ARTIFACT_TYPES.SPREADSHEET, true],
    [TOOL_ARTIFACT_TYPES.PRESENTATION, true],
    [TOOL_ARTIFACT_TYPES.HTML, false],
    [TOOL_ARTIFACT_TYPES.REACT, false],
    [TOOL_ARTIFACT_TYPES.MARKDOWN, false],
    [TOOL_ARTIFACT_TYPES.MERMAID, false],
    [TOOL_ARTIFACT_TYPES.CODE, false],
    [TOOL_ARTIFACT_TYPES.PLAIN_TEXT, false],
  ])('returns %s for type %s', (type, expected) => {
    expect(isPreviewOnlyArtifact(type)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['application/pdf'], ['text/plain'], ['some/random-type']])(
    'returns false for non-artifact type %s',
    (type) => {
      expect(isPreviewOnlyArtifact(type)).toBe(false);
    },
  );
});
