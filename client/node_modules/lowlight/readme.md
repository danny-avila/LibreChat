<!--lint disable no-html-->

# lowlight

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]

Virtual syntax highlighting for virtual DOMs and non-HTML things.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`lowlight.highlight(language, value[, options])`](#lowlighthighlightlanguage-value-options)
    *   [`lowlight.highlightAuto(value[, options])`](#lowlighthighlightautovalue-options)
    *   [`lowlight.registerLanguage(language, syntax)`](#lowlightregisterlanguagelanguage-syntax)
    *   [`lowlight.registerAlias(language, alias)`](#lowlightregisteraliaslanguage-alias)
    *   [`lowlight.registered(aliasOrlanguage)`](#lowlightregisteredaliasorlanguage)
    *   [`lowlight.listLanguages()`](#lowlightlistlanguages)
*   [Examples](#examples)
    *   [Example: serializing hast as html](#example-serializing-hast-as-html)
    *   [Example: turning hast into react nodes](#example-turning-hast-into-react-nodes)
*   [Types](#types)
*   [Data](#data)
*   [CSS](#css)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Projects](#projects)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package wraps [highlight.js][] to output objects (ASTs) instead of a string
of HTML.

`highlight.js`, through lowlight, supports 190+ programming languages.
Supporting all of them requires a lot of code.
That’s why there are three entry points for lowlight:

<!--index start-->

*   `lib/core.js` — 0 languages
*   `lib/common.js` (default) — 37 languages
*   `lib/all.js` — 192 languages

<!--index end-->

Bundled, minified, and gzipped, those are roughly 9.7 kB, 47 kB, and 290 kB.

## When should I use this?

This package is useful when you want to perform syntax highlighting in a place
where serialized HTML wouldn’t work or wouldn’t work well.
For example, you can use lowlight when you want to show code in a CLI by
rendering to ANSI sequences, when you’re using virtual DOM frameworks (such as
React or Preact) so that diffing can be performant, or when you’re working with
ASTs (rehype).

A different package, [`refractor`][refractor], does the same as lowlight but
uses [Prism][] instead.
If you’re looking for a *really good* (but rather heavy) highlighter, try
[`starry-night`][starry-night].

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+, 16.0+), install with [npm][]:

```sh
npm install lowlight
```

In Deno with [`esm.sh`][esmsh]:

```js
import {lowlight} from 'https://esm.sh/lowlight@2'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {lowlight} from 'https://esm.sh/lowlight@2?bundle'
</script>
```

## Use

```js
import {lowlight} from 'lowlight'

const tree = lowlight.highlight('js', '"use strict";')

console.dir(tree, {depth: null})
```

Yields:

```js
{
  type: 'root',
  data: {language: 'js', relevance: 10},
  children: [
    {
      type: 'element',
      tagName: 'span',
      properties: {className: ['hljs-meta']},
      children: [{type: 'text', value: '"use strict"'}]
    },
    {type: 'text', value: ';'}
  ]
}
```

## API

This package exports the identifier `lowlight`.
There is no default export.

### `lowlight.highlight(language, value[, options])`

Highlight `value` (code) as `language` (name).

###### Parameters

*   `language` (`string`)
    — programming language [name][names]
*   `value` (`string`)
    — code to highlight
*   `options.prefix` (`string?`, default: `'hljs-'`)
    — class prefix

###### Returns

A hast [`Root`][root] node with the following `data` fields:

*   `relevance` (`number`)
    — how sure lowlight is that the given code is in the language
*   `language` (`string`)
    — detected programming language name

###### Example

```js
import {lowlight} from 'lowlight'

console.log(lowlight.highlight('css', 'em { color: red }'))
```

Yields:

```js
{type: 'root', data: {language: 'css', relevance: 3}, children: [Array]}
```

### `lowlight.highlightAuto(value[, options])`

Highlight `value` (code) and guess its programming language.

###### Parameters

*   `value` (`string`)
    — code to highlight
*   `options.prefix` (`string?`, default: `'hljs-'`)
    — class prefix
*   `options.subset` (`Array<string>`, default: all registered language names)
    — list of allowed languages

###### Returns

The same result as `lowlight.highlight` is returned.

###### Example

```js
import {lowlight} from 'lowlight'

console.log(lowlight.highlightAuto('"hello, " + name + "!"'))
```

Yields:

```js
{type: 'root', data: {language: 'applescript', relevance: 3}, children: [Array]}

```

### `lowlight.registerLanguage(language, syntax)`

Register a language.

###### Parameters

*   `language` (`string`)
    — programming language name
*   `syntax` ([`HighlightSyntax`][syntax])
    — `highlight.js` syntax

###### Note

`highlight.js` operates as a singleton: once you register a language in one
place, it’ll be available everywhere.

###### Example

```js
import {lowlight} from 'lowlight/lib/core.js'
import xml from 'highlight.js/lib/languages/xml.js'

lowlight.registerLanguage('xml', xml)

console.log(lowlight.highlight('html', '<em>Emphasis</em>'))
```

Yields:

```js
{type: 'root', data: {language: 'html', relevance: 2}, children: [Array]}
```

### `lowlight.registerAlias(language, alias)`

Register aliases for already registered languages.

###### Signatures

*   `registerAlias(language, alias|list)`
*   `registerAlias(aliases)`

###### Parameters

*   `language` (`string`)
    — programming language [name][names]
*   `alias` (`string`)
    — new aliases for the programming language
*   `list` (`Array<string>`)
    — list of aliases
*   `aliases` (`Record<language, alias|list>`)
    — map of `language`s to `alias`es or `list`s

###### Example

```js
import {lowlight} from 'lowlight/lib/core.js'
import md from 'highlight.js/lib/languages/markdown.js'

lowlight.registerLanguage('markdown', md)

// lowlight.highlight('mdown', '<em>Emphasis</em>')
// ^ would throw: Error: Unknown language: `mdown` is not registered

lowlight.registerAlias({markdown: ['mdown', 'mkdn', 'mdwn', 'ron']})
lowlight.highlight('mdown', '<em>Emphasis</em>')
// ^ Works!
```

### `lowlight.registered(aliasOrlanguage)`

Check whether an `alias` or `language` is registered.

###### Parameters

*   `aliasOrlanguage` (`string`)
    — [name][names] of a registered language or alias

###### Returns

Whether `aliasOrlanguage` is registered (`boolean`).

###### Example

```js
import {lowlight} from 'lowlight/lib/core.js'
import javascript from 'highlight.js/lib/languages/javascript.js'

lowlight.registerLanguage('javascript', javascript)

lowlight.registered('js') // return false

lowlight.registerAlias('javascript', 'js')
lowlight.registered('js') // return true
```

### `lowlight.listLanguages()`

List registered languages.

###### Returns

Names of registered language (`Array<string>`).

###### Example

```js
import {lowlight} from 'lowlight/lib/core.js'
import md from 'highlight.js/lib/languages/markdown.js'

console.log(lowlight.listLanguages()) // => []

lowlight.registerLanguage('markdown', md)

console.log(lowlight.listLanguages()) // => ['markdown']
```

## Examples

### Example: serializing hast as html

hast trees as returned by lowlight can be serialized with
[`hast-util-to-html`][hast-util-to-html]:

```js
import {lowlight} from 'lowlight'
import {toHtml} from 'hast-util-to-html'

const tree = lowlight.highlight('js', '"use strict";')

console.log(toHtml(tree))
```

Yields:

```html
<span class="hljs-meta">"use strict"</span>;
```

### Example: turning hast into react nodes

hast trees as returned by lowlight can be turned into React (or Preact) with
[`hast-to-hyperscript`][hast-to-hyperscript]:

```js
import {lowlight} from 'lowlight'
import {toH} from 'hast-to-hyperscript'
import React from 'react'

const tree = lowlight.highlight('js', '"use strict";')
const react = toH(React.createElement, tree)

console.log(react)
```

Yields:

```js
{
  '$$typeof': Symbol(react.element),
  type: 'div',
  key: 'h-1',
  ref: null,
  props: { children: [ [Object], ';' ] },
  _owner: null,
  _store: {}
}
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional types `Root`, `Options`, and `AutoOptions`.

<!--Old name of the following section:-->

<a name="syntaxes"></a>

## Data

If you’re using `lowlight/lib/core.js`, no syntaxes are included.
Checked syntaxes are included if you import `lowlight` (or explicitly
`lowlight/lib/common.js`).
Unchecked syntaxes are available through `lowlight/lib/all.js`.
You can import `core` or `common` and manually add more languages as you please.

`highlight.js` operates as a singleton: once you register a language in one
place, it’ll be available everywhere.

<!--support start-->

*   [ ] `1c` — 1C:Enterprise
*   [ ] `abnf` — Augmented Backus-Naur Form
*   [ ] `accesslog` — Apache Access Log
*   [ ] `actionscript` (`as`) — ActionScript
*   [ ] `ada` — Ada
*   [ ] `angelscript` (`asc`) — AngelScript
*   [ ] `apache` (`apacheconf`) — Apache config
*   [ ] `applescript` (`osascript`) — AppleScript
*   [ ] `arcade` — ArcGIS Arcade
*   [x] `arduino` (`ino`) — Arduino
*   [ ] `armasm` (`arm`) — ARM Assembly
*   [ ] `asciidoc` (`adoc`) — AsciiDoc
*   [ ] `aspectj` — AspectJ
*   [ ] `autohotkey` (`ahk`) — AutoHotkey
*   [ ] `autoit` — AutoIt
*   [ ] `avrasm` — AVR Assembly
*   [ ] `awk` — Awk
*   [ ] `axapta` (`x++`) — X++
*   [x] `bash` (`sh`) — Bash
*   [ ] `basic` — BASIC
*   [ ] `bnf` — Backus–Naur Form
*   [ ] `brainfuck` (`bf`) — Brainfuck
*   [x] `c` (`h`) — C
*   [ ] `cal` — C/AL
*   [ ] `capnproto` (`capnp`) — Cap’n Proto
*   [ ] `ceylon` — Ceylon
*   [ ] `clean` (`icl`, `dcl`) — Clean
*   [ ] `clojure` (`clj`, `edn`) — Clojure
*   [ ] `clojure-repl` — Clojure REPL
*   [ ] `cmake` (`cmake.in`) — CMake
*   [ ] `coffeescript` (`coffee`, `cson`, `iced`) — CoffeeScript
*   [ ] `coq` — Coq
*   [ ] `cos` (`cls`) — Caché Object Script
*   [x] `cpp` (`cc`, `c++`, `h++`, `hpp`, `hh`, `hxx`, `cxx`) — C++
*   [ ] `crmsh` (`crm`, `pcmk`) — crmsh
*   [ ] `crystal` (`cr`) — Crystal
*   [x] `csharp` (`cs`, `c#`) — C#
*   [ ] `csp` — CSP
*   [x] `css` — CSS
*   [ ] `d` — D
*   [ ] `dart` — Dart
*   [ ] `delphi` (`dpr`, `dfm`, `pas`, `pascal`) — Delphi
*   [x] `diff` (`patch`) — Diff
*   [ ] `django` (`jinja`) — Django
*   [ ] `dns` (`bind`, `zone`) — DNS Zone
*   [ ] `dockerfile` (`docker`) — Dockerfile
*   [ ] `dos` (`bat`, `cmd`) — Batch file (DOS)
*   [ ] `dsconfig` — undefined
*   [ ] `dts` — Device Tree
*   [ ] `dust` (`dst`) — Dust
*   [ ] `ebnf` — Extended Backus-Naur Form
*   [ ] `elixir` (`ex`, `exs`) — Elixir
*   [ ] `elm` — Elm
*   [ ] `erb` — ERB
*   [ ] `erlang` (`erl`) — Erlang
*   [ ] `erlang-repl` — Erlang REPL
*   [ ] `excel` (`xlsx`, `xls`) — Excel formulae
*   [ ] `fix` — FIX
*   [ ] `flix` — Flix
*   [ ] `fortran` (`f90`, `f95`) — Fortran
*   [ ] `fsharp` (`fs`, `f#`) — F#
*   [ ] `gams` (`gms`) — GAMS
*   [ ] `gauss` (`gss`) — GAUSS
*   [ ] `gcode` (`nc`) — G-code (ISO 6983)
*   [ ] `gherkin` (`feature`) — Gherkin
*   [ ] `glsl` — GLSL
*   [ ] `gml` — GML
*   [x] `go` (`golang`) — Go
*   [ ] `golo` — Golo
*   [ ] `gradle` — Gradle
*   [x] `graphql` (`gql`) — GraphQL
*   [ ] `groovy` — Groovy
*   [ ] `haml` — HAML
*   [ ] `handlebars` (`hbs`, `html.hbs`, `html.handlebars`, `htmlbars`) — Handlebars
*   [ ] `haskell` (`hs`) — Haskell
*   [ ] `haxe` (`hx`) — Haxe
*   [ ] `hsp` — HSP
*   [ ] `http` (`https`) — HTTP
*   [ ] `hy` (`hylang`) — Hy
*   [ ] `inform7` (`i7`) — Inform 7
*   [x] `ini` (`toml`) — TOML, also INI
*   [ ] `irpf90` — IRPF90
*   [ ] `isbl` — ISBL
*   [x] `java` (`jsp`) — Java
*   [x] `javascript` (`js`, `jsx`, `mjs`, `cjs`) — JavaScript
*   [ ] `jboss-cli` (`wildfly-cli`) — JBoss CLI
*   [x] `json` — JSON
*   [ ] `julia` — Julia
*   [ ] `julia-repl` (`jldoctest`) — Julia REPL
*   [x] `kotlin` (`kt`, `kts`) — Kotlin
*   [ ] `lasso` (`ls`, `lassoscript`) — Lasso
*   [ ] `latex` (`tex`) — LaTeX
*   [ ] `ldif` — LDIF
*   [ ] `leaf` — Leaf
*   [x] `less` — Less
*   [ ] `lisp` — Lisp
*   [ ] `livecodeserver` — LiveCode
*   [ ] `livescript` (`ls`) — LiveScript
*   [ ] `llvm` — LLVM IR
*   [ ] `lsl` — LSL (Linden Scripting Language)
*   [x] `lua` — Lua
*   [x] `makefile` (`mk`, `mak`, `make`) — Makefile
*   [x] `markdown` (`md`, `mkdown`, `mkd`) — Markdown
*   [ ] `mathematica` (`mma`, `wl`) — Mathematica
*   [ ] `matlab` — Matlab
*   [ ] `maxima` — Maxima
*   [ ] `mel` — MEL
*   [ ] `mercury` (`m`, `moo`) — Mercury
*   [ ] `mipsasm` (`mips`) — MIPS Assembly
*   [ ] `mizar` — Mizar
*   [ ] `mojolicious` — Mojolicious
*   [ ] `monkey` — Monkey
*   [ ] `moonscript` (`moon`) — MoonScript
*   [ ] `n1ql` — N1QL
*   [ ] `nestedtext` (`nt`) — Nested Text
*   [ ] `nginx` (`nginxconf`) — Nginx config
*   [ ] `nim` — Nim
*   [ ] `nix` (`nixos`) — Nix
*   [ ] `node-repl` — Node REPL
*   [ ] `nsis` — NSIS
*   [x] `objectivec` (`mm`, `objc`, `obj-c`, `obj-c++`, `objective-c++`) — Objective-C
*   [ ] `ocaml` (`ml`) — OCaml
*   [ ] `openscad` (`scad`) — OpenSCAD
*   [ ] `oxygene` — Oxygene
*   [ ] `parser3` — Parser3
*   [x] `perl` (`pl`, `pm`) — Perl
*   [ ] `pf` (`pf.conf`) — Packet Filter config
*   [ ] `pgsql` (`postgres`, `postgresql`) — PostgreSQL
*   [x] `php` — undefined
*   [x] `php-template` — PHP template
*   [x] `plaintext` (`text`, `txt`) — Plain text
*   [ ] `pony` — Pony
*   [ ] `powershell` (`pwsh`, `ps`, `ps1`) — PowerShell
*   [ ] `processing` (`pde`) — Processing
*   [ ] `profile` — Python profiler
*   [ ] `prolog` — Prolog
*   [ ] `properties` — .properties
*   [ ] `protobuf` (`proto`) — Protocol Buffers
*   [ ] `puppet` (`pp`) — Puppet
*   [ ] `purebasic` (`pb`, `pbi`) — PureBASIC
*   [x] `python` (`py`, `gyp`, `ipython`) — Python
*   [x] `python-repl` (`pycon`) — undefined
*   [ ] `q` (`k`, `kdb`) — Q
*   [ ] `qml` (`qt`) — QML
*   [x] `r` — R
*   [ ] `reasonml` (`re`) — ReasonML
*   [ ] `rib` — RenderMan RIB
*   [ ] `roboconf` (`graph`, `instances`) — Roboconf
*   [ ] `routeros` (`mikrotik`) — MikroTik RouterOS script
*   [ ] `rsl` — RenderMan RSL
*   [x] `ruby` (`rb`, `gemspec`, `podspec`, `thor`, `irb`) — Ruby
*   [ ] `ruleslanguage` — Oracle Rules Language
*   [x] `rust` (`rs`) — Rust
*   [ ] `sas` — SAS
*   [ ] `scala` — Scala
*   [ ] `scheme` (`scm`) — Scheme
*   [ ] `scilab` (`sci`) — Scilab
*   [x] `scss` — SCSS
*   [x] `shell` (`console`, `shellsession`) — Shell Session
*   [ ] `smali` — Smali
*   [ ] `smalltalk` (`st`) — Smalltalk
*   [ ] `sml` (`ml`) — SML (Standard ML)
*   [ ] `sqf` — SQF
*   [x] `sql` — SQL
*   [ ] `stan` (`stanfuncs`) — Stan
*   [ ] `stata` (`do`, `ado`) — Stata
*   [ ] `step21` (`p21`, `step`, `stp`) — STEP Part 21
*   [ ] `stylus` (`styl`) — Stylus
*   [ ] `subunit` — SubUnit
*   [x] `swift` — Swift
*   [ ] `taggerscript` — Tagger Script
*   [ ] `tap` — Test Anything Protocol
*   [ ] `tcl` (`tk`) — Tcl
*   [ ] `thrift` — Thrift
*   [ ] `tp` — TP
*   [ ] `twig` (`craftcms`) — Twig
*   [x] `typescript` (`ts`, `tsx`, `mts`, `cts`) — TypeScript
*   [ ] `vala` — Vala
*   [x] `vbnet` (`vb`) — Visual Basic .NET
*   [ ] `vbscript` (`vbs`) — VBScript
*   [ ] `vbscript-html` — VBScript in HTML
*   [ ] `verilog` (`v`, `sv`, `svh`) — Verilog
*   [ ] `vhdl` — VHDL
*   [ ] `vim` — Vim Script
*   [x] `wasm` — WebAssembly
*   [ ] `wren` — Wren
*   [ ] `x86asm` — Intel x86 Assembly
*   [ ] `xl` (`tao`) — XL
*   [x] `xml` (`html`, `xhtml`, `rss`, `atom`, `xjb`, `xsd`, `xsl`, `plist`, `wsf`, `svg`) — HTML, XML
*   [ ] `xquery` (`xpath`, `xq`) — XQuery
*   [x] `yaml` (`yml`) — YAML
*   [ ] `zephir` (`zep`) — Zephir

<!--support end-->

## CSS

`lowlight` does not inject CSS for the syntax highlighted code (because well,
lowlight doesn’t have to be turned into HTML and might not run in a browser!).
If you are in a browser, you can use any `highlight.js` theme.
For example, to get GitHub Dark from cdnjs:

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.2.0/styles/github-dark.min.css">
```

## Compatibility

This package is at least compatible with all maintained versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
It also works in Deno and modern browsers.

## Security

This package is safe.

## Related

*   [`refractor`][refractor]
    — the same as lowlight but with [Prism][]
*   [`starry-night`][starry-night]
    — similar but like GitHub and really good

## Projects

*   [`emphasize`](https://github.com/wooorm/emphasize)
    — syntax highlighting in ANSI (for the terminal)
*   [`react-lowlight`](https://github.com/rexxars/react-lowlight)
    — syntax highlighter for [React][]
*   [`react-syntax-highlighter`](https://github.com/conorhastings/react-syntax-highlighter)
    — [React][] component for syntax highlighting
*   [`rehype-highlight`](https://github.com/rehypejs/rehype-highlight)
    — [**rehype**](https://github.com/rehypejs/rehype) plugin to highlight code
    blocks
*   [`jstransformer-lowlight`](https://github.com/ai/jstransformer-lowlight)
    — syntax highlighting for [JSTransformers](https://github.com/jstransformers)
    and [Pug](https://pugjs.org/language/filters.html)

## Contribute

Yes please!
See [How to Contribute to Open Source][contribute].

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/wooorm/lowlight/workflows/main/badge.svg

[build]: https://github.com/wooorm/lowlight/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/wooorm/lowlight.svg

[coverage]: https://codecov.io/github/wooorm/lowlight

[downloads-badge]: https://img.shields.io/npm/dm/lowlight.svg

[downloads]: https://www.npmjs.com/package/lowlight

[size-badge]: https://img.shields.io/bundlephobia/minzip/lowlight.svg

[size]: https://bundlephobia.com/result?p=lowlight

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[license]: license

[author]: https://wooorm.com

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[typescript]: https://www.typescriptlang.org

[contribute]: https://opensource.guide/how-to-contribute/

[root]: https://github.com/syntax-tree/hast#root

[highlight.js]: https://github.com/highlightjs/highlight.js

[syntax]: https://github.com/highlightjs/highlight.js/blob/main/docs/language-guide.rst

[names]: https://github.com/highlightjs/highlight.js/blob/main/SUPPORTED_LANGUAGES.md

[react]: https://facebook.github.io/react/

[prism]: https://github.com/PrismJS/prism

[refractor]: https://github.com/wooorm/refractor

[starry-night]: https://github.com/wooorm/starry-night

[hast-util-to-html]: https://github.com/syntax-tree/hast-util-to-html

[hast-to-hyperscript]: https://github.com/syntax-tree/hast-to-hyperscript
