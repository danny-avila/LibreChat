import React, { Suspense } from 'react';
import { FileText } from 'lucide-react';
import type { IconType } from '@icons-pack/react-simple-icons/types';

interface LangIconProps {
  lang: string;
  className?: string;
}

/** Dynamic import factories — each icon is code-split into its own chunk and loaded on demand. */
const ICON_IMPORTS: Record<string, () => Promise<{ default: IconType }>> = {
  python: () => import('@icons-pack/react-simple-icons/icons/SiPython'),
  javascript: () => import('@icons-pack/react-simple-icons/icons/SiJavascript'),
  typescript: () => import('@icons-pack/react-simple-icons/icons/SiTypescript'),
  rust: () => import('@icons-pack/react-simple-icons/icons/SiRust'),
  go: () => import('@icons-pack/react-simple-icons/icons/SiGo'),
  java: () => import('@icons-pack/react-simple-icons/icons/SiOpenjdk'),
  ruby: () => import('@icons-pack/react-simple-icons/icons/SiRuby'),
  c: () => import('@icons-pack/react-simple-icons/icons/SiC'),
  cpp: () => import('@icons-pack/react-simple-icons/icons/SiCplusplus'),
  csharp: () => import('@icons-pack/react-simple-icons/icons/SiDotnet'),
  html: () => import('@icons-pack/react-simple-icons/icons/SiHtml5'),
  css: () => import('@icons-pack/react-simple-icons/icons/SiCss'),
  php: () => import('@icons-pack/react-simple-icons/icons/SiPhp'),
  swift: () => import('@icons-pack/react-simple-icons/icons/SiSwift'),
  kotlin: () => import('@icons-pack/react-simple-icons/icons/SiKotlin'),
  bash: () => import('@icons-pack/react-simple-icons/icons/SiGnubash'),
  json: () => import('@icons-pack/react-simple-icons/icons/SiJson'),
  r: () => import('@icons-pack/react-simple-icons/icons/SiR'),
  dart: () => import('@icons-pack/react-simple-icons/icons/SiDart'),
  lua: () => import('@icons-pack/react-simple-icons/icons/SiLua'),
  elixir: () => import('@icons-pack/react-simple-icons/icons/SiElixir'),
  haskell: () => import('@icons-pack/react-simple-icons/icons/SiHaskell'),
  scala: () => import('@icons-pack/react-simple-icons/icons/SiScala'),
  perl: () => import('@icons-pack/react-simple-icons/icons/SiPerl'),
  clojure: () => import('@icons-pack/react-simple-icons/icons/SiClojure'),
  julia: () => import('@icons-pack/react-simple-icons/icons/SiJulia'),
  zig: () => import('@icons-pack/react-simple-icons/icons/SiZig'),
  nim: () => import('@icons-pack/react-simple-icons/icons/SiNim'),
  fortran: () => import('@icons-pack/react-simple-icons/icons/SiFortran'),
  erlang: () => import('@icons-pack/react-simple-icons/icons/SiErlang'),
  fsharp: () => import('@icons-pack/react-simple-icons/icons/SiFsharp'),
  solidity: () => import('@icons-pack/react-simple-icons/icons/SiSolidity'),
  coffeescript: () => import('@icons-pack/react-simple-icons/icons/SiCoffeescript'),
  ocaml: () => import('@icons-pack/react-simple-icons/icons/SiOcaml'),
  crystal: () => import('@icons-pack/react-simple-icons/icons/SiCrystal'),
  groovy: () => import('@icons-pack/react-simple-icons/icons/SiApachegroovy'),
  d: () => import('@icons-pack/react-simple-icons/icons/SiD'),
  v: () => import('@icons-pack/react-simple-icons/icons/SiV'),
  odin: () => import('@icons-pack/react-simple-icons/icons/SiOdin'),
  delphi: () => import('@icons-pack/react-simple-icons/icons/SiDelphi'),
  racket: () => import('@icons-pack/react-simple-icons/icons/SiRacket'),
  purescript: () => import('@icons-pack/react-simple-icons/icons/SiPurescript'),
  sass: () => import('@icons-pack/react-simple-icons/icons/SiSass'),
  less: () => import('@icons-pack/react-simple-icons/icons/SiLess'),
  markdown: () => import('@icons-pack/react-simple-icons/icons/SiMarkdown'),
  yaml: () => import('@icons-pack/react-simple-icons/icons/SiYaml'),
  toml: () => import('@icons-pack/react-simple-icons/icons/SiToml'),
  xml: () => import('@icons-pack/react-simple-icons/icons/SiXml'),
  graphql: () => import('@icons-pack/react-simple-icons/icons/SiGraphql'),
  latex: () => import('@icons-pack/react-simple-icons/icons/SiLatex'),
  webassembly: () => import('@icons-pack/react-simple-icons/icons/SiWebassembly'),
};

const LANG_ALIASES: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  rs: 'rust',
  golang: 'go',
  rb: 'ruby',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  powershell: 'bash',
  cmd: 'bash',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  dotnet: 'csharp',
  htm: 'html',
  html5: 'html',
  css3: 'css',
  scss: 'sass',
  jsonc: 'json',
  json5: 'json',
  yml: 'yaml',
  mysql: 'json',
  postgresql: 'json',
  sqlite: 'json',
  sql: 'json',
  kt: 'kotlin',
  kts: 'kotlin',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  pl: 'perl',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  jl: 'julia',
  ml: 'ocaml',
  mli: 'ocaml',
  fs: 'fsharp',
  fsx: 'fsharp',
  cr: 'crystal',
  coffee: 'coffeescript',
  sol: 'solidity',
  wasm: 'webassembly',
  wat: 'webassembly',
  gql: 'graphql',
  tex: 'latex',
  md: 'markdown',
  mdx: 'markdown',
  pas: 'delphi',
  pascal: 'delphi',
  rkt: 'racket',
  purs: 'purescript',
};

/** Module-level cache so each language resolves to a single stable React.lazy component. */
const lazyIconCache = new Map<string, React.LazyExoticComponent<IconType>>();

function getLazyIcon(key: string): React.LazyExoticComponent<IconType> | null {
  const factory = ICON_IMPORTS[key];
  if (!factory) {
    return null;
  }
  const cached = lazyIconCache.get(key);
  if (cached) {
    return cached;
  }
  const component = React.lazy(factory);
  lazyIconCache.set(key, component);
  return component;
}

const LangIcon = React.memo(function LangIcon({ lang, className }: LangIconProps) {
  const key = lang.toLowerCase();
  if (key === 'txt' || key === 'text') {
    return <FileText className={className} aria-hidden="true" />;
  }
  const resolved = LANG_ALIASES[key] ?? key;
  const Icon = getLazyIcon(resolved);
  if (!Icon) {
    return null;
  }
  return (
    <Suspense fallback={<span className={className} aria-hidden="true" />}>
      <Icon className={className} aria-hidden="true" title="" />
    </Suspense>
  );
});

export default LangIcon;
