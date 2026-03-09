import React from 'react';
import SiC from '@icons-pack/react-simple-icons/icons/SiC';
import SiD from '@icons-pack/react-simple-icons/icons/SiD';
import SiR from '@icons-pack/react-simple-icons/icons/SiR';
import SiV from '@icons-pack/react-simple-icons/icons/SiV';
import SiGo from '@icons-pack/react-simple-icons/icons/SiGo';
import SiCss from '@icons-pack/react-simple-icons/icons/SiCss';
import SiLua from '@icons-pack/react-simple-icons/icons/SiLua';
import SiNim from '@icons-pack/react-simple-icons/icons/SiNim';
import SiPhp from '@icons-pack/react-simple-icons/icons/SiPhp';
import SiXml from '@icons-pack/react-simple-icons/icons/SiXml';
import SiZig from '@icons-pack/react-simple-icons/icons/SiZig';
import SiDart from '@icons-pack/react-simple-icons/icons/SiDart';
import SiJson from '@icons-pack/react-simple-icons/icons/SiJson';
import SiLess from '@icons-pack/react-simple-icons/icons/SiLess';
import SiOdin from '@icons-pack/react-simple-icons/icons/SiOdin';
import SiPerl from '@icons-pack/react-simple-icons/icons/SiPerl';
import SiRuby from '@icons-pack/react-simple-icons/icons/SiRuby';
import SiRust from '@icons-pack/react-simple-icons/icons/SiRust';
import SiSass from '@icons-pack/react-simple-icons/icons/SiSass';
import SiToml from '@icons-pack/react-simple-icons/icons/SiToml';
import SiYaml from '@icons-pack/react-simple-icons/icons/SiYaml';
import SiHtml5 from '@icons-pack/react-simple-icons/icons/SiHtml5';
import SiJulia from '@icons-pack/react-simple-icons/icons/SiJulia';
import SiLatex from '@icons-pack/react-simple-icons/icons/SiLatex';
import SiOcaml from '@icons-pack/react-simple-icons/icons/SiOcaml';
import SiScala from '@icons-pack/react-simple-icons/icons/SiScala';
import SiSwift from '@icons-pack/react-simple-icons/icons/SiSwift';
import SiDotnet from '@icons-pack/react-simple-icons/icons/SiDotnet';
import SiElixir from '@icons-pack/react-simple-icons/icons/SiElixir';
import SiErlang from '@icons-pack/react-simple-icons/icons/SiErlang';
import SiFsharp from '@icons-pack/react-simple-icons/icons/SiFsharp';
import SiKotlin from '@icons-pack/react-simple-icons/icons/SiKotlin';
import SiPython from '@icons-pack/react-simple-icons/icons/SiPython';
import SiRacket from '@icons-pack/react-simple-icons/icons/SiRacket';
import SiClojure from '@icons-pack/react-simple-icons/icons/SiClojure';
import SiCrystal from '@icons-pack/react-simple-icons/icons/SiCrystal';
import SiDelphi from '@icons-pack/react-simple-icons/icons/SiDelphi';
import SiFortran from '@icons-pack/react-simple-icons/icons/SiFortran';
import SiGraphql from '@icons-pack/react-simple-icons/icons/SiGraphql';
import SiGnubash from '@icons-pack/react-simple-icons/icons/SiGnubash';
import SiHaskell from '@icons-pack/react-simple-icons/icons/SiHaskell';
import SiOpenjdk from '@icons-pack/react-simple-icons/icons/SiOpenjdk';
import SiMarkdown from '@icons-pack/react-simple-icons/icons/SiMarkdown';
import SiSolidity from '@icons-pack/react-simple-icons/icons/SiSolidity';
import SiCplusplus from '@icons-pack/react-simple-icons/icons/SiCplusplus';
import SiPurescript from '@icons-pack/react-simple-icons/icons/SiPurescript';
import SiTypescript from '@icons-pack/react-simple-icons/icons/SiTypescript';
import SiJavascript from '@icons-pack/react-simple-icons/icons/SiJavascript';
import SiWebassembly from '@icons-pack/react-simple-icons/icons/SiWebassembly';
import SiCoffeescript from '@icons-pack/react-simple-icons/icons/SiCoffeescript';
import SiApachegroovy from '@icons-pack/react-simple-icons/icons/SiApachegroovy';
import type { IconType } from '@icons-pack/react-simple-icons/types';

interface LangIconProps {
  lang: string;
  className?: string;
}

const ICONS: Record<string, IconType> = {
  python: SiPython,
  javascript: SiJavascript,
  typescript: SiTypescript,
  rust: SiRust,
  go: SiGo,
  java: SiOpenjdk,
  ruby: SiRuby,
  c: SiC,
  cpp: SiCplusplus,
  csharp: SiDotnet,
  html: SiHtml5,
  css: SiCss,
  php: SiPhp,
  swift: SiSwift,
  kotlin: SiKotlin,
  bash: SiGnubash,
  json: SiJson,
  r: SiR,
  dart: SiDart,
  lua: SiLua,
  elixir: SiElixir,
  haskell: SiHaskell,
  scala: SiScala,
  perl: SiPerl,
  clojure: SiClojure,
  julia: SiJulia,
  zig: SiZig,
  nim: SiNim,
  fortran: SiFortran,
  erlang: SiErlang,
  fsharp: SiFsharp,
  solidity: SiSolidity,
  coffeescript: SiCoffeescript,
  ocaml: SiOcaml,
  crystal: SiCrystal,
  groovy: SiApachegroovy,
  d: SiD,
  v: SiV,
  odin: SiOdin,
  delphi: SiDelphi,
  racket: SiRacket,
  purescript: SiPurescript,
  sass: SiSass,
  less: SiLess,
  markdown: SiMarkdown,
  yaml: SiYaml,
  toml: SiToml,
  xml: SiXml,
  graphql: SiGraphql,
  latex: SiLatex,
  webassembly: SiWebassembly,
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

const LangIcon = React.memo(function LangIcon({ lang, className }: LangIconProps) {
  const key = lang.toLowerCase();
  const resolved = LANG_ALIASES[key] ?? key;
  const Icon = ICONS[resolved];
  if (!Icon) {
    return null;
  }
  return <Icon className={className} aria-hidden="true" title="" />;
});

export default LangIcon;
