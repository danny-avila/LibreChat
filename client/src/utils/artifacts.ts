import dedent from 'dedent';
import { shadcnComponents } from 'librechat-data-provider';
import type {
  SandpackProviderProps,
  SandpackPredefinedTemplate,
} from '@codesandbox/sandpack-react';
import type { TStartupConfig, TAttachment, TFile } from 'librechat-data-provider';
import type { Artifact } from '~/common';

const artifactFilename = {
  'application/vnd.react': 'App.tsx',
  'application/vnd.ant.react': 'App.tsx',
  'text/html': 'index.html',
  'application/vnd.code-html': 'index.html',
  // mermaid and markdown types are handled separately in useArtifactProps.ts
  default: 'index.html',
  // 'css': 'css',
  // 'javascript': 'js',
  // 'typescript': 'ts',
  // 'jsx': 'jsx',
  // 'tsx': 'tsx',
};

const artifactTemplate: Record<
  | keyof typeof artifactFilename
  | 'application/vnd.mermaid'
  | 'application/vnd.code'
  | 'text/markdown'
  | 'text/md'
  | 'text/plain',
  SandpackPredefinedTemplate | undefined
> = {
  'text/html': 'static',
  'application/vnd.react': 'react-ts',
  'application/vnd.ant.react': 'react-ts',
  'application/vnd.mermaid': 'react-ts',
  'application/vnd.code-html': 'static',
  /* CODE bucket reuses the static markdown pipeline — `useArtifactProps`
   * pre-wraps the content in a fenced block and hands it to
   * `getMarkdownFiles`, so the rendered HTML uses the same `marked`
   * pipeline as `.md` artifacts. Keeping `static` (vs. `react-ts`) means
   * the panel doesn't pay the sandpack-React boot cost for source files. */
  'application/vnd.code': 'static',
  'text/markdown': 'static',
  'text/md': 'static',
  'text/plain': 'static',
  default: 'static',
  // 'css': 'css',
  // 'javascript': 'js',
  // 'typescript': 'ts',
  // 'jsx': 'jsx',
  // 'tsx': 'tsx',
};

export function getKey(type: string, language?: string): string {
  return `${type}${(language?.length ?? 0) > 0 ? `-${language}` : ''}`;
}

export function getArtifactFilename(type: string, language?: string): string {
  const key = getKey(type, language);
  return artifactFilename[key] ?? artifactFilename.default;
}

export function getTemplate(type: string, language?: string): SandpackPredefinedTemplate {
  const key = getKey(type, language);
  return artifactTemplate[key] ?? (artifactTemplate.default as SandpackPredefinedTemplate);
}

const standardDependencies = {
  three: '^0.167.1',
  'lucide-react': '^0.394.0',
  'react-router-dom': '^6.11.2',
  'class-variance-authority': '^0.6.0',
  clsx: '^1.2.1',
  'date-fns': '^3.3.1',
  'tailwind-merge': '^1.9.1',
  'tailwindcss-animate': '^1.0.5',
  recharts: '2.12.7',
  '@radix-ui/react-accordion': '^1.1.2',
  '@radix-ui/react-alert-dialog': '^1.0.2',
  '@radix-ui/react-aspect-ratio': '^1.1.0',
  '@radix-ui/react-avatar': '^1.1.0',
  '@radix-ui/react-checkbox': '^1.0.3',
  '@radix-ui/react-collapsible': '^1.0.3',
  '@radix-ui/react-dialog': '^1.0.2',
  '@radix-ui/react-dropdown-menu': '^2.1.1',
  '@radix-ui/react-hover-card': '^1.0.5',
  '@radix-ui/react-label': '^2.0.0',
  '@radix-ui/react-menubar': '^1.1.1',
  '@radix-ui/react-navigation-menu': '^1.2.0',
  '@radix-ui/react-popover': '^1.0.7',
  '@radix-ui/react-progress': '^1.1.0',
  '@radix-ui/react-radio-group': '^1.1.3',
  '@radix-ui/react-select': '^2.0.0',
  '@radix-ui/react-separator': '^1.0.3',
  '@radix-ui/react-slider': '^1.1.1',
  '@radix-ui/react-switch': '^1.0.3',
  '@radix-ui/react-tabs': '^1.0.3',
  '@radix-ui/react-toast': '^1.1.5',
  '@radix-ui/react-slot': '^1.1.0',
  '@radix-ui/react-toggle': '^1.1.0',
  '@radix-ui/react-toggle-group': '^1.1.0',
  '@radix-ui/react-tooltip': '^1.2.8',
  'embla-carousel-react': '^8.2.0',
  'react-day-picker': '^9.0.8',
  'dat.gui': '^0.7.9',
  vaul: '^0.9.1',
};

const mermaidDependencies = {
  mermaid: '^11.4.1',
  'react-zoom-pan-pinch': '^3.6.1',
  'class-variance-authority': '^0.6.0',
  clsx: '^1.2.1',
  'tailwind-merge': '^1.9.1',
  '@radix-ui/react-slot': '^1.1.0',
};

const dependenciesMap: Record<
  | keyof typeof artifactFilename
  | 'application/vnd.mermaid'
  | 'application/vnd.code'
  | 'text/markdown'
  | 'text/md'
  | 'text/plain',
  Record<string, string>
> = {
  'application/vnd.mermaid': mermaidDependencies,
  'application/vnd.react': standardDependencies,
  'application/vnd.ant.react': standardDependencies,
  'text/html': standardDependencies,
  'application/vnd.code-html': standardDependencies,
  /* CODE renders in the static markdown template; no React or other
   * runtime deps. Empty map skips the sandpack `package.json` install
   * step entirely (same as MARKDOWN/PLAIN_TEXT). */
  'application/vnd.code': {},
  'text/markdown': {},
  'text/md': {},
  'text/plain': {},
  default: standardDependencies,
};

export function getDependencies(type: string): Record<string, string> {
  return dependenciesMap[type] ?? standardDependencies;
}

export function getProps(type: string): Partial<SandpackProviderProps> {
  return {
    customSetup: {
      dependencies: getDependencies(type),
    },
  };
}

/** Fragment hint lets Sandpack's static-template regex detect `.js` from the URL;
 * without it, the versioned CDN path (`/3.4.17`) has no recognised extension and
 * `injectExternalResources` throws "Unable to determine file type". */
const TAILWIND_CDN = 'https://cdn.tailwindcss.com/3.4.17#tailwind.js';

export const sharedOptions: SandpackProviderProps['options'] = {
  externalResources: [TAILWIND_CDN],
};

export function buildSandpackOptions(
  template: SandpackProviderProps['template'],
  startupConfig?: TStartupConfig,
): SandpackProviderProps['options'] {
  if (!startupConfig) {
    return sharedOptions;
  }

  return {
    ...sharedOptions,
    bundlerURL: template === 'static' ? startupConfig.staticBundlerURL : startupConfig.bundlerURL,
  };
}

/**
 * Strip path separators so extension/bare-name lookups operate on the
 * basename only. Artifact filenames can carry nested directories
 * through the path-preserving sanitizer in the backend, and a dotted
 * directory name (e.g. `pkg.v1/Dockerfile`) would otherwise produce a
 * nonsensical "extension" like `v1/dockerfile`.
 */
const basenameOf = (filename: string): string => {
  const slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  return slash >= 0 ? filename.slice(slash + 1) : filename;
};

/**
 * Internal: derive the lowercased extension from a pre-computed basename.
 * Returns `''` for hidden-files (`.env` → `env` in legacy code, but we
 * deliberately preserve that for backwards compatibility with the
 * extension-list lookup; the bare-name fallback handles the
 * extensionless case separately). The shared variant lets
 * `detectArtifactTypeFromFile` compute the basename once and reuse it
 * across the extension AND bare-name lookups.
 */
const extensionFromBasename = (base: string): string => {
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) {
    return '';
  }
  return base.slice(dot + 1).toLowerCase();
};

/**
 * Internal: derive the lowercased bare name for extensionless filenames
 * from a pre-computed basename. Returns `''` for files that DO have an
 * extension so `extensionOf` and `bareNameOf` are mutually exclusive.
 */
const bareNameFromBasename = (base: string): string => {
  if (base.includes('.')) {
    return '';
  }
  return base.toLowerCase();
};

/**
 * Restrict the dot search to the basename — `pkg.v1/Dockerfile` should
 * yield `''` (extensionless), not `v1/dockerfile`. Otherwise
 * `languageForFilename` returns the path-laden string as the language
 * hint and `marked` emits a `language-v1/dockerfile` class (broken).
 * The bare-name fallback then can't fire because this returned
 * non-empty.
 */
const extensionOf = (filename: string | undefined): string => {
  if (!filename) return '';
  return extensionFromBasename(basenameOf(filename));
};

/**
 * Lowercased basename for extensionless filenames. Lets the routing map
 * recognize `Dockerfile`, `Makefile`, `Gemfile`, etc. as code without
 * a dotted extension. Returns `''` for files that DO have an extension
 * (those go through `extensionOf`) so the two helpers don't double-match.
 */
const bareNameOf = (filename: string | undefined): string => {
  if (!filename) return '';
  return bareNameFromBasename(basenameOf(filename));
};

/** Strip charset / boundary parameters so we can do exact MIME comparisons. */
const baseMime = (mime: string | undefined): string => {
  if (!mime) {
    return '';
  }
  const semi = mime.indexOf(';');
  return (semi < 0 ? mime : mime.slice(0, semi)).trim().toLowerCase();
};

/**
 * Artifact MIME types we currently know how to render in the side panel
 * (or, for mermaid, inline). Plain text covers files we can show as raw
 * content even without a dedicated viewer (txt, docx-extracted text, …);
 * `useArtifactProps` routes `text/plain` through the markdown template
 * so the panel renders them cleanly. `CODE` is the same idea for source
 * files — `useArtifactProps` wraps the content in a fenced code block
 * with a language hint before handing it to the markdown viewer.
 */
export const TOOL_ARTIFACT_TYPES = {
  HTML: 'text/html',
  REACT: 'application/vnd.react',
  MARKDOWN: 'text/markdown',
  MERMAID: 'application/vnd.mermaid',
  PLAIN_TEXT: 'text/plain',
  CODE: 'application/vnd.code',
} as const;

export type ToolArtifactType = (typeof TOOL_ARTIFACT_TYPES)[keyof typeof TOOL_ARTIFACT_TYPES];

/**
 * Extension → fenced-code-block language hint for the CODE bucket. The
 * key is the lowercased file extension (no dot); the value is the
 * identifier `marked` reads off the fence (e.g. ```` ```python ```` ).
 * The map drives BOTH the `EXTENSION_TO_TOOL_ARTIFACT_TYPE` routing
 * (presence in this map = code file) and the fenced-block emit in
 * `useArtifactProps`, so adding a new language is one place.
 *
 * Identifiers follow the GitHub / `highlight.js` convention so a future
 * highlighter swap-in (currently the markdown template uses plain
 * `marked`) picks up syntax colors automatically.
 *
 * Scope: programming languages + stylesheets + shell/SQL/build files.
 * Pure data formats (CSV/TSV/JSON/YAML/TOML/XML) and config files
 * (`.env`/`.ini`/`.conf`) are intentionally NOT routed to CODE in this
 * pass — they're better served by dedicated viewers (CSV table view,
 * etc.) or remain inline. Adding them later is a one-entry change.
 */
const CODE_EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // Web / scripting
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  py: 'python',
  pyi: 'python',
  rb: 'ruby',
  php: 'php',
  pl: 'perl',
  pm: 'perl',
  lua: 'lua',
  // Compiled / systems
  go: 'go',
  rs: 'rust',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  m: 'objectivec',
  mm: 'objectivec',
  swift: 'swift',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  // Functional / data
  r: 'r',
  jl: 'julia',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  clj: 'clojure',
  cljs: 'clojure',
  fs: 'fsharp',
  fsx: 'fsharp',
  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  bat: 'batch',
  cmd: 'batch',
  // Build / query languages. The bare-name `Dockerfile` / `Makefile` /
  // etc. cases are documented on `bareNameOf`.
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gemfile: 'ruby',
  rakefile: 'ruby',
  vagrantfile: 'ruby',
  brewfile: 'ruby',
  gradle: 'groovy',
  tf: 'hcl',
  hcl: 'hcl',
  patch: 'diff',
  diff: 'diff',
  // Stylesheets
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
};

/**
 * MIME → fenced-block language hint. Used as a fallback for files whose
 * filename has no extension AND no recognized bare name — without this,
 * an attachment like `{ filename: 'noext', type: 'text/x-python' }`
 * would route to CODE (via the MIME bucket map above) but render with
 * an empty `language-` class, losing the syntax-hint metadata the
 * future highlighter swap-in needs.
 *
 * Best-effort: covers the language MIMEs the codeapi backend actually
 * emits (mirrors `MIME_TO_TOOL_ARTIFACT_TYPE`'s CODE entries). MIMEs
 * without an entry here just fall through to the empty hint, same as
 * unknown extensions.
 */
const MIME_TO_LANGUAGE: Record<string, string> = {
  'text/javascript': 'javascript',
  'application/javascript': 'javascript',
  'application/sql': 'sql',
  'application/x-sh': 'bash',
  'application/x-php': 'php',
  'application/x-powershell': 'powershell',
  'text/x-python': 'python',
  'text/x-typescript': 'typescript',
  'text/x-ruby': 'ruby',
  'text/x-go': 'go',
  'text/x-rust': 'rust',
  'text/x-c': 'c',
  'text/x-c++': 'cpp',
  'text/x-csharp': 'csharp',
  'text/x-java': 'java',
  'text/x-kotlin': 'kotlin',
  'text/x-scala': 'scala',
  'text/x-perl': 'perl',
  'text/x-r': 'r',
  'text/x-lua': 'lua',
  'text/x-swift': 'swift',
  'text/css': 'css',
};

/**
 * Look up the fenced-block language hint for an attachment, trying (in
 * order): the filename's extension, the lowercased basename for
 * extensionless build files, and the MIME type. Falls back to the raw
 * extension if not in the map (so a `.foo` source still gets
 * ```` ```foo ```` and renders monospace, even without highlighting).
 * Empty string when no signal yields a hint — the fence emits as
 * ```` ``` ```` with no language token.
 *
 * The MIME fallback covers the case where codeapi reports a code file
 * with a stripped or extensionless name AND a useful Content-Type
 * (e.g. `{ filename: 'noext', type: 'text/x-python' }`). Without it,
 * such files would route to CODE but render without `language-python`
 * on the `<code>` element.
 */
export function languageForFilename(
  filename: string | undefined,
  mime?: string | undefined,
): string {
  const ext = extensionOf(filename);
  if (ext) {
    return CODE_EXTENSION_TO_LANGUAGE[ext] ?? ext;
  }
  /* Extensionless filename: try the basename. `Dockerfile` →
   * `dockerfile` → `'dockerfile'` language hint. */
  const bare = bareNameOf(filename);
  if (bare && Object.prototype.hasOwnProperty.call(CODE_EXTENSION_TO_LANGUAGE, bare)) {
    return CODE_EXTENSION_TO_LANGUAGE[bare];
  }
  /* MIME fallback for the extensionless-name + useful-MIME case. */
  if (mime) {
    const stripped = baseMime(mime);
    if (Object.prototype.hasOwnProperty.call(MIME_TO_LANGUAGE, stripped)) {
      return MIME_TO_LANGUAGE[stripped];
    }
  }
  return '';
}

/**
 * Find the longest run of backticks that could close a fenced code block
 * inside `source`. CommonMark allows the closer to be indented up to 3
 * spaces, so runs at columns 0–3 all qualify. The fence emitted by
 * `wrapAsFencedCodeBlock` must have STRICTLY MORE backticks than any
 * such run inside the payload — otherwise a markdown snippet inside a
 * JS template literal (or any source containing ` ``` ` near
 * column 0) closes the outer fence early and the rest renders as
 * markdown, corrupting the artifact.
 */
export function longestLeadingBacktickRun(source: string): number {
  let max = 0;
  /* `^ {0,3}(`+)` matches lines whose leading whitespace is ≤ 3
   * spaces (per CommonMark's fence-indent allowance) followed by one
   * or more backticks. Tabs are not allowed — CommonMark expands them
   * to 4 spaces, which is over the closer limit. The multiline + global
   * flags scan every line in the payload. */
  const re = /^ {0,3}(`+)/gm;
  for (let m = re.exec(source); m !== null; m = re.exec(source)) {
    if (m[1].length > max) max = m[1].length;
  }
  return max;
}

/**
 * Wrap raw source as a fenced markdown code block so the CODE bucket
 * can ride the existing markdown rendering pipeline — `marked` emits
 * `<pre><code class="language-<lang>">…</code></pre>` and the future
 * highlighter swap-in (currently the markdown template uses plain
 * `marked` with no syntax colors) will pick up `language-<lang>`
 * automatically. Pure; deterministic; safe on empty input (renders an
 * empty fenced block which marked handles cleanly).
 *
 * Fence length is adaptive: 3 backticks by default, but bumped to
 * (longest-leading-run-in-source + 1) when the source contains
 * ` ``` ` (or longer) near the start of any line. This is the
 * CommonMark-spec way to embed a fenced block inside another fenced
 * block — see e.g. the markdown spec's nested-fence examples — and
 * avoids the early-close attack on artifacts whose source is itself
 * markdown-shaped.
 */
export function wrapAsFencedCodeBlock(source: string, lang: string): string {
  const fenceLength = Math.max(3, longestLeadingBacktickRun(source) + 1);
  const fence = '`'.repeat(fenceLength);
  /* Trim a single trailing newline (common in extractor output) so the
   * fence's closing ``` lands on its own line rather than after a blank
   * gap that marked would render as an extra <br>. */
  const body = source.endsWith('\n') ? source.slice(0, -1) : source;
  return fence + lang + '\n' + body + '\n' + fence;
}

const EXTENSION_TO_TOOL_ARTIFACT_TYPE: Record<string, ToolArtifactType> = {
  html: TOOL_ARTIFACT_TYPES.HTML,
  htm: TOOL_ARTIFACT_TYPES.HTML,
  // jsx/tsx are React component sources — keep them on the React
  // (sandpack) bucket rather than the new CODE bucket so the existing
  // live-preview behavior survives. Plain JS/TS source goes through CODE.
  jsx: TOOL_ARTIFACT_TYPES.REACT,
  tsx: TOOL_ARTIFACT_TYPES.REACT,
  md: TOOL_ARTIFACT_TYPES.MARKDOWN,
  markdown: TOOL_ARTIFACT_TYPES.MARKDOWN,
  mdx: TOOL_ARTIFACT_TYPES.MARKDOWN,
  mmd: TOOL_ARTIFACT_TYPES.MERMAID,
  mermaid: TOOL_ARTIFACT_TYPES.MERMAID,
  // Plain text + office documents fall through to the markdown-style
  // viewer until dedicated renderers land. `pptx` is wired up here so
  // the routing fires as soon as backend text extraction is added.
  txt: TOOL_ARTIFACT_TYPES.PLAIN_TEXT,
  docx: TOOL_ARTIFACT_TYPES.PLAIN_TEXT,
  odt: TOOL_ARTIFACT_TYPES.PLAIN_TEXT,
  pptx: TOOL_ARTIFACT_TYPES.PLAIN_TEXT,
};

/* Append every entry in `CODE_EXTENSION_TO_LANGUAGE` to the routing map
 * pointing at the CODE bucket. Keeping the language map as the source
 * of truth means a new language is one entry away from being routable.
 *
 * Skip extensions already claimed by a non-CODE bucket — `jsx`/`tsx`
 * belong to React (sandpack) for the live-preview, and a future
 * contributor adding them to `CODE_EXTENSION_TO_LANGUAGE` (a natural
 * mistake — they ARE source code) shouldn't silently break the React
 * routing path. The explicit map entries above always win. */
for (const ext of Object.keys(CODE_EXTENSION_TO_LANGUAGE)) {
  if (ext in EXTENSION_TO_TOOL_ARTIFACT_TYPE) continue;
  EXTENSION_TO_TOOL_ARTIFACT_TYPE[ext] = TOOL_ARTIFACT_TYPES.CODE;
}

const MIME_TO_TOOL_ARTIFACT_TYPE: Record<string, ToolArtifactType> = {
  'text/html': TOOL_ARTIFACT_TYPES.HTML,
  'application/vnd.code-html': TOOL_ARTIFACT_TYPES.HTML,
  'text/markdown': TOOL_ARTIFACT_TYPES.MARKDOWN,
  'text/md': TOOL_ARTIFACT_TYPES.MARKDOWN,
  'application/vnd.react': TOOL_ARTIFACT_TYPES.REACT,
  'application/vnd.ant.react': TOOL_ARTIFACT_TYPES.REACT,
  'application/vnd.mermaid': TOOL_ARTIFACT_TYPES.MERMAID,
  // Code MIME types — codeapi serves these via Content-Type for source
  // files (`text/x-python`, `text/x-typescript`, etc.) so a file whose
  // extension was stripped or renamed upstream still routes to CODE.
  // This is a best-effort COMMON-CASE list, not an exhaustive mirror of
  // `CODE_EXTENSION_TO_LANGUAGE` — extension-based routing is the
  // primary path, and the MIME table only matters when the filename is
  // missing/extensionless AND the upstream supplied a useful MIME.
  // Adding more here is harmless; missing entries fall through to inline
  // rendering (the same as today).
  'text/javascript': TOOL_ARTIFACT_TYPES.CODE,
  'application/javascript': TOOL_ARTIFACT_TYPES.CODE,
  'application/sql': TOOL_ARTIFACT_TYPES.CODE,
  'application/x-sh': TOOL_ARTIFACT_TYPES.CODE,
  'application/x-php': TOOL_ARTIFACT_TYPES.CODE,
  'application/x-powershell': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-python': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-typescript': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-ruby': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-go': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-rust': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-c': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-c++': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-csharp': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-java': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-kotlin': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-scala': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-perl': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-r': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-lua': TOOL_ARTIFACT_TYPES.CODE,
  'text/x-swift': TOOL_ARTIFACT_TYPES.CODE,
  'text/css': TOOL_ARTIFACT_TYPES.CODE,
  // Office MIME types fall through to the plain-text bucket here too —
  // matches the extension map so a file whose extension was stripped
  // somewhere upstream still routes to the panel.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    TOOL_ARTIFACT_TYPES.PLAIN_TEXT,
  'application/vnd.oasis.opendocument.text': TOOL_ARTIFACT_TYPES.PLAIN_TEXT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    TOOL_ARTIFACT_TYPES.PLAIN_TEXT,
  // Note: bare `text/plain` is NOT mapped here. The extension map handles
  // `.txt` explicitly; routing every unrecognized-extension `text/plain`
  // file (extensionless scripts, .env, etc.) through the panel would be a
  // wider catch than intended. Those still render via the inline `<pre>`.
};

/**
 * Decide whether a tool-produced file should render through the artifacts
 * panel (or inline mermaid component). Returns the canonical artifact MIME
 * type if so, or `null` to let the caller fall through to the existing
 * download / inline-text rendering.
 *
 * Empty `text` is tolerated for the plain-text and markdown buckets so a
 * file whose extraction is still TBD (e.g. pptx, or a docx where the
 * extractor errored) keeps visual parity with its docx/odt siblings — the
 * card still routes through the panel and `fileToArtifact` substitutes a
 * placeholder so the panel renders something sensible. The HTML, React,
 * and Mermaid buckets still require real content because their viewers
 * (sandpack / mermaid.js) error on empty input.
 */
export function detectArtifactTypeFromFile(
  attachment: Partial<Pick<TFile, 'filename' | 'type' | 'text'>>,
): ToolArtifactType | null {
  /* Compute the basename once and reuse it across the extension AND
   * bare-name lookups. Both `extensionOf(filename)` and
   * `bareNameOf(filename)` would otherwise split path separators
   * twice on the same input. */
  const base = attachment.filename ? basenameOf(attachment.filename) : '';
  const byExtension = EXTENSION_TO_TOOL_ARTIFACT_TYPE[extensionFromBasename(base)];
  /* Bare-name fallback for extensionless build files (`Dockerfile`,
   * `Makefile`, `Gemfile`, `Rakefile`, `Vagrantfile`, `Brewfile`). Only
   * fires when the extension lookup missed AND the basename is in the
   * routing map; everything else stays on the existing extension/MIME
   * paths. */
  const byBareName = byExtension
    ? undefined
    : EXTENSION_TO_TOOL_ARTIFACT_TYPE[bareNameFromBasename(base)];
  const type =
    byExtension ?? byBareName ?? MIME_TO_TOOL_ARTIFACT_TYPE[baseMime(attachment.type)] ?? null;
  if (type == null) {
    return null;
  }
  if (
    !attachment.text &&
    type !== TOOL_ARTIFACT_TYPES.PLAIN_TEXT &&
    type !== TOOL_ARTIFACT_TYPES.MARKDOWN &&
    type !== TOOL_ARTIFACT_TYPES.CODE
  ) {
    return null;
  }
  return type;
}

/**
 * Stable per-file key used for both the artifactsState entry and the
 * `toolArtifactClaim` atom that dedups duplicate cards. Same call shape
 * everywhere so a panel card and a mermaid card for the same file share
 * the same claim. Falls through `file_id` → `filename` → `filepath` to
 * minimise collision risk for any caller that (rarely) lacks `file_id`.
 */
export const toolArtifactKey = (
  file: Partial<Pick<TFile, 'file_id' | 'filename' | 'filepath'>>,
): string => `tool-artifact-${file.file_id ?? file.filename ?? file.filepath ?? 'unknown'}`;

/**
 * Stable epoch fallback (instead of `Date.now()`) when neither timestamp
 * is available. `useArtifacts` sorts by `lastUpdateTime`, so a fresh
 * `Date.now()` on every call would re-sort entries non-deterministically
 * across renders. Using `0` parks unsorted entries at the bottom of the
 * panel's tab strip until real timestamps arrive.
 */
const toLastUpdate = (file: Partial<Pick<TFile, 'updatedAt' | 'createdAt'>>): number => {
  const value = file.updatedAt ?? file.createdAt;
  if (value == null) {
    return 0;
  }
  const ms = new Date(value as string | number | Date).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

interface FileToArtifactOptions {
  /**
   * Markdown rendered in the panel when the underlying file has no text
   * yet (e.g. a pptx whose extractor hasn't run). Callers should provide
   * a localized string via `useLocalize`; if omitted, an empty string is
   * substituted (the panel will look bare but won't crash).
   */
  placeholder?: string;
  /**
   * Pre-classified artifact type from a prior `detectArtifactTypeFromFile`
   * call; skips re-classification. Used by the routing decision tree
   * which has already classified to pick which renderer to use.
   */
  preClassifiedType?: ToolArtifactType;
}

/**
 * Convert a code-execution attachment to an `Artifact` shape if (and only
 * if) we have a viewer for it. The id is derived from `file_id` so the
 * same file across renders maps to the same artifact entry.
 */
export function fileToArtifact(
  // Every picked field is read with a fallback in the implementation
  // (`detectArtifactTypeFromFile`, `toolArtifactKey`, `toLastUpdate`,
  // and the empty-string nullish coalesces below), so the input type
  // mirrors that and marks them optional. Required-by-strict-pick was
  // making every test fixture and many real callers fail typecheck for
  // fields the function never strictly needs.
  attachment: Partial<
    Pick<TAttachment, 'messageId'> &
      Pick<TFile, 'file_id' | 'filename' | 'filepath' | 'type' | 'text' | 'updatedAt' | 'createdAt'>
  >,
  options?: FileToArtifactOptions,
): Artifact | null {
  const type = options?.preClassifiedType ?? detectArtifactTypeFromFile(attachment);
  if (!type) {
    return null;
  }
  // Mirror the empty-text gate from `detectArtifactTypeFromFile` so a
  // caller that supplies `preClassifiedType` (and thus skips that gate)
  // can't accidentally hand HTML/React/Mermaid an empty buffer that
  // their viewers would error on. Plain-text and markdown are still
  // tolerated empty — the markdown viewer renders empty cleanly.
  if (
    !attachment.text &&
    type !== TOOL_ARTIFACT_TYPES.PLAIN_TEXT &&
    type !== TOOL_ARTIFACT_TYPES.MARKDOWN &&
    type !== TOOL_ARTIFACT_TYPES.CODE
  ) {
    return null;
  }
  /* For CODE artifacts, resolve the language hint at construction time
   * (rather than re-deriving from `artifact.title` in `useArtifactProps`)
   * so the MIME fallback fires for extensionless filenames. Without
   * this, `{ filename: 'noext', type: 'text/x-python' }` would route
   * to CODE via the MIME bucket but render with an empty `language-`
   * class because the title carries no extension to classify. The
   * resolved language is stored on `artifact.language`, which the
   * hook reads directly. */
  const language =
    type === TOOL_ARTIFACT_TYPES.CODE
      ? languageForFilename(attachment.filename, attachment.type)
      : undefined;
  return {
    id: toolArtifactKey(attachment),
    type,
    title: attachment.filename ?? 'Generated artifact',
    // Nullish coalesce — an empty string is a legitimate file (e.g. a
    // user wrote an empty `.md`) and should render as empty in the
    // panel rather than be replaced by the deferred-extraction
    // placeholder. Only `null`/`undefined` fall through to the
    // placeholder, matching "no extraction has run yet."
    content: attachment.text ?? options?.placeholder ?? '',
    language,
    messageId: attachment.messageId ?? undefined,
    lastUpdateTime: toLastUpdate(attachment),
  };
}

export const sharedFiles = {
  '/lib/utils.ts': shadcnComponents.utils,
  '/components/ui/accordion.tsx': shadcnComponents.accordian,
  '/components/ui/alert-dialog.tsx': shadcnComponents.alertDialog,
  '/components/ui/alert.tsx': shadcnComponents.alert,
  '/components/ui/avatar.tsx': shadcnComponents.avatar,
  '/components/ui/badge.tsx': shadcnComponents.badge,
  '/components/ui/breadcrumb.tsx': shadcnComponents.breadcrumb,
  '/components/ui/button.tsx': shadcnComponents.button,
  '/components/ui/calendar.tsx': shadcnComponents.calendar,
  '/components/ui/card.tsx': shadcnComponents.card,
  '/components/ui/carousel.tsx': shadcnComponents.carousel,
  '/components/ui/checkbox.tsx': shadcnComponents.checkbox,
  '/components/ui/collapsible.tsx': shadcnComponents.collapsible,
  '/components/ui/dialog.tsx': shadcnComponents.dialog,
  '/components/ui/drawer.tsx': shadcnComponents.drawer,
  '/components/ui/dropdown-menu.tsx': shadcnComponents.dropdownMenu,
  '/components/ui/input.tsx': shadcnComponents.input,
  '/components/ui/label.tsx': shadcnComponents.label,
  '/components/ui/menubar.tsx': shadcnComponents.menuBar,
  '/components/ui/navigation-menu.tsx': shadcnComponents.navigationMenu,
  '/components/ui/pagination.tsx': shadcnComponents.pagination,
  '/components/ui/popover.tsx': shadcnComponents.popover,
  '/components/ui/progress.tsx': shadcnComponents.progress,
  '/components/ui/radio-group.tsx': shadcnComponents.radioGroup,
  '/components/ui/select.tsx': shadcnComponents.select,
  '/components/ui/separator.tsx': shadcnComponents.separator,
  '/components/ui/skeleton.tsx': shadcnComponents.skeleton,
  '/components/ui/slider.tsx': shadcnComponents.slider,
  '/components/ui/switch.tsx': shadcnComponents.switchComponent,
  '/components/ui/table.tsx': shadcnComponents.table,
  '/components/ui/tabs.tsx': shadcnComponents.tabs,
  '/components/ui/textarea.tsx': shadcnComponents.textarea,
  '/components/ui/toast.tsx': shadcnComponents.toast,
  '/components/ui/toaster.tsx': shadcnComponents.toaster,
  '/components/ui/toggle-group.tsx': shadcnComponents.toggleGroup,
  '/components/ui/toggle.tsx': shadcnComponents.toggle,
  '/components/ui/tooltip.tsx': shadcnComponents.tooltip,
  '/components/ui/use-toast.tsx': shadcnComponents.useToast,
  '/public/index.html': dedent`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Document</title>
        <script src="https://cdn.tailwindcss.com/3.4.17"></script>
        <style>
          ::-webkit-scrollbar{height:.1em;width:.5rem}
          ::-webkit-scrollbar-thumb{background-color:rgba(0,0,0,.1);border-radius:9999px}
          ::-webkit-scrollbar-track{background-color:transparent;border-radius:9999px}
          @media(prefers-color-scheme:dark){::-webkit-scrollbar-thumb{background-color:hsla(0,0%,100%,.1)}}
          *{scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.1) transparent}
          @media(prefers-color-scheme:dark){*{scrollbar-color:hsla(0,0%,100%,.1) transparent}}
        </style>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
  `,
};
