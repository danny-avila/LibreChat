# rehype-highlight

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[rehype][]** plugin to apply syntax highlighting to code with
[`highlight.js`][highlight-js] (through [`lowlight`][lowlight]).

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`unified().use(rehypeHighlight[, options])`](#unifieduserehypehighlight-options)
*   [Example](#example)
    *   [Example: ignoring](#example-ignoring)
    *   [Example: registering](#example-registering)
    *   [Example: aliases](#example-aliases)
    *   [Example: sanitation](#example-sanitation)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a [unified][] ([rehype][]) plugin to apply syntax highlighting
to code with `highlight.js`.
`highlight.js` is pretty fast, relatively small, and a quite good syntax
highlighter which has support for up to 190 different languages.
This package bundles 35 [common languages][common] by default and you can
register more.

It looks for `<code>` elements (when directly in `<pre>` elements) and changes
them.
You can specify the code language (such as Python) with a `language-*` or
`lang-*` class, where the `*` can be for example `js` (so `language-js`), `md`,
`css`, etc.
By default, code without such a language class is not highlighted.
Pass `detect: true` to detect their programming language and highlight the code
anyway.
You can still prevent specific blocks from being highlighted with a
`no-highlight` or `nohighlight` class on the `<code>`.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**rehype** adds support for HTML to unified.
**hast** is the HTML AST that rehype uses.
This is a rehype plugin that applies syntax highlighting to the AST.

## When should I use this?

This project is useful when you want to apply syntax highlighting in rehype.
One reason to do that is that it typically means the highlighting happens once
at build time instead of every time at run time.

There are several other community plugins that apply syntax highlighting.
Some of them are great choices but some are broken.
As anyone can make rehype plugins, make sure to carefully assess the quality of
rehype plugins.

This plugin is built on [`lowlight`][lowlight], which is a virtual version of
highlight.js.
You can make a plugin based on this one with lowlight when you want to do things
differently.

## Install

This package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).
In Node.js (version 12.20+, 14.14+, or 16.0+), install with [npm][]:

```sh
npm install rehype-highlight
```

In Deno with [`esm.sh`][esmsh]:

```js
import rehypeHighlight from 'https://esm.sh/rehype-highlight@5'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import rehypeHighlight from 'https://esm.sh/rehype-highlight@5?bundle'
</script>
```

## Use

Say we have the following file `example.html`:

```html
<h1>Hello World!</h1>

<pre><code class="language-js">var name = "World";
console.warn("Hello, " + name + "!")</code></pre>
```

And our module `example.js` looks as follows:

```js
import {read} from 'to-vfile'
import {rehype} from 'rehype'
import rehypeHighlight from 'rehype-highlight'

const file = await rehype()
  .data('settings', {fragment: true})
  .use(rehypeHighlight)
  .process(await read('example.html'))

console.log(String(file))
```

Now running `node example.js` yields:

```html
<h1>Hello World!</h1>

<pre><code class="hljs language-js"><span class="hljs-keyword">var</span> name = <span class="hljs-string">"World"</span>;
<span class="hljs-variable hljs-language">console</span>.<span class="hljs-title hljs-function">warn</span>(<span class="hljs-string">"Hello, "</span> + name + <span class="hljs-string">"!"</span>)</code></pre>
```

## API

This package exports no identifiers.
The default export is `rehypeHighlight`.

### `unified().use(rehypeHighlight[, options])`

Apply syntax highlighting to code with `highlight.js`.

##### `options`

Configuration (optional).

###### `options.prefix`

Prefix to use before classes (`string`, default: `'hljs-'`).

###### `options.detect`

Whether to detect the programming language on code without a language class
(`boolean`, default: `false`).

###### `options.subset`

Languages to check when automatically detecting (`Array<string>`, default: all
languages).

###### `options.plainText`

List of plain-text languages (`Array<string>`, default: `[]`).
Pass any languages you would like to be kept as plain-text instead of getting
highlighted.
This is like setting a `no-highlight` class assuming `txt` was listed, then
`language-txt` would be treated as such too.

###### `options.ignoreMissing`

Swallow errors for missing languages (`boolean`, default: `false`).
By default, unregistered syntaxes throw an error when they are used.
Pass `true` to swallow those errors and thus ignore code with unknown code
languages.

###### `options.aliases`

Register more aliases (`Record<string, string|Array<string>>`, default: `{}`).
Passed to [`lowlight.registerAlias`][register-alias].

###### `options.languages`

Register more languages (`Record<string, Function>`, default: `{}`).
Each key/value pair passed as arguments to
[`lowlight.registerLanguage`][register-language].

## Example

### Example: ignoring

There are three ways to not apply syntax highlighting to code blocks.
They can be ignored with an explicit class of `no-highlight` (or `nohighlight`),
an explicit language name that’s listed in `options.plainText`, or by setting
`options.subset` to `false`, which prevents `<code>` without a class from being
automatically detected.

For example, with `example.html`:

```html
<pre><code>this won’t be highlighted due to `subset: false`</code></pre>

<pre><code class="no-highlight">this won’t be highlighted due to its class</code></pre>

<pre><code class="language-txt">this won’t be highlighted due to `plainText: ['txt']`</code></pre>
```

And `example.js`:

```js
import {read} from 'to-vfile'
import {rehype} from 'rehype'
import rehypeHighlight from 'rehype-highlight'

main()

async function main() {
  const file = await rehype()
    .data('settings', {fragment: true})
    .use(rehypeHighlight, {subset: false, plainText: ['txt', 'text']})
    .process(await read('example.html'))

  console.log(String(file))
}
```

Running that yields the same as `example.html`: none of them are highlighted.

### Example: registering

`rehype-highlight` supports 35 common used languages by default.
This makes it small to load in browsers and Node.js, while supporting most cases
by default.
It’s possible to add support for more languages.

For example, with `example.html`:

```html
<pre><code class="language-bnf">a ::= 'a' | 'A'</code></pre>
```

And `example.js`:

```js
import {read} from 'to-vfile'
import {rehype} from 'rehype'
import rehypeHighlight from 'rehype-highlight'
import bnf from 'highlight.js/lib/languages/bnf'

main()

async function main() {
  const file = await rehype()
    .data('settings', {fragment: true})
    .use(rehypeHighlight, {languages: {bnf}})
    .process(await read('example.html'))

  console.log(String(file))
}
```

Running that yields:

```html
<pre><code class="hljs language-bnf">a ::= <span class="hljs-string">'a'</span> | <span class="hljs-string">'A'</span></code></pre>
```

### Example: aliases

You can map your own language flags to `highlight.js` languages.

For example, with `example.html`:

```html
<pre><code class="language-custom-script">console.log(1)</code></pre>
```

And `example.js`:

```js
import {read} from 'to-vfile'
import {rehype} from 'rehype'
import rehypeHighlight from 'rehype-highlight'

main()

async function main() {
  const file = await rehype()
    .data('settings', {fragment: true})
    // 👉 **Note**: the keys are registered and full highlight.js names, and
    // the values are the flags that you want to allow as `x` in `language-x`
    // classes.
    .use(rehypeHighlight, {aliases: {'javascript': 'custom-script'}})
    .process(await read('example.html'))

  console.log(String(file))
}
```

Running that yields:

```html
<pre><code class="hljs language-custom-script"><span class="hljs-variable hljs-language">console</span>.<span class="hljs-title hljs-function">log</span>(<span class="hljs-number">1</span>)</code></pre>
```

### Example: sanitation

Applying syntax highlighting in rehype operates on `<code>` elements with
certain classes and it injects many `<span>` elements with classes.
Allowing arbitrary classes is an opening for XSS vulnerabilities.

Working with user input and HTML generally opens you up to XSS vulnerabilities,
so it’s recommend to use sanitation mechanisms, typically
[`rehype-sanitize`][rehype-sanitize].
Because arbitrary classes are one such opening that `rehype-sanitize` takes care
off, using `rehype-highlight` with `rehype-sanitize` requires some configuration
to make it work.

There are two ways to make it work.
Either by using `rehype-sanitize` first while allowing the classes on `<code>`
and then using `rehype-highlight`, or alternatively first using
`rehype-highlight` and then using `rehype-sanitize` while allowing the classes
on `<span>` elements.
Using `rehype-sanitize` before `rehype-highlight`:

```js
import {unified} from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, {defaultSchema} from './index.js'
import rehypeStringify from 'rehype-stringify'

main()

async function main() {
  const file = await unified()
    .use(rehypeParse, {fragment: true})
    .use(rehypeSanitize, {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        code: [
          ...(defaultSchema.attributes.code || []),
          // List of all allowed languages:
          ['className', 'language-js', 'language-css', 'language-md']
        ]
      }
    })
    .use(rehypeHighlight, {subset: false})
    .use(rehypeStringify)
    .process('<pre><code className="language-js">console.log(1)</code></pre>')

  console.log(String(file))
}
```

Using `rehype-highlight` before `rehype-sanitize`:

```diff
 async function main() {
   const file = await unified()
     .use(rehypeParse, {fragment: true})
+    .use(rehypeHighlight, {subset: false})
     .use(rehypeSanitize, {
       ...defaultSchema,
       attributes: {
         ...defaultSchema.attributes,
-        code: [
-          ...(defaultSchema.attributes.code || []),
-          // List of all allowed languages:
-          ['className', 'hljs', 'language-js', 'language-css', 'language-md']
+        span: [
+          ...(defaultSchema.attributes.span || []),
+          // List of all allowed tokens:
+          ['className', 'hljs-addition', 'hljs-attr', 'hljs-attribute', 'hljs-built_in', 'hljs-bullet', 'hljs-char', 'hljs-code', 'hljs-comment', 'hljs-deletion', 'hljs-doctag', 'hljs-emphasis', 'hljs-formula', 'hljs-keyword', 'hljs-link', 'hljs-literal', 'hljs-meta', 'hljs-name', 'hljs-number', 'hljs-operator', 'hljs-params', 'hljs-property', 'hljs-punctuation', 'hljs-quote', 'hljs-regexp', 'hljs-section', 'hljs-selector-attr', 'hljs-selector-class', 'hljs-selector-id', 'hljs-selector-pseudo', 'hljs-selector-tag', 'hljs-string', 'hljs-strong', 'hljs-subst', 'hljs-symbol', 'hljs-tag', 'hljs-template-tag', 'hljs-template-variable', 'hljs-title', 'hljs-type', 'hljs-variable'
+          ]
         ]
       }
     })
-    .use(rehypeHighlight, {subset: false})
     .use(rehypeStringify)
     .process('<pre><code className="language-js">console.log(1)</code></pre>')
```

## Types

This package is fully typed with [TypeScript][].
It exports an `Options` type, which specifies the interface of the accepted
options.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

This plugin works with `rehype-parse` version 1+, `rehype-stringify` version 1+,
`rehype` version 1+, and `unified` version 4+.

## Security

Use of `rehype-highlight` *should* be safe to use as `highlight.js` and
`lowlight` *should* be safe to use.
When in doubt, use [`rehype-sanitize`][rehype-sanitize].

## Related

*   [`rehype-meta`](https://github.com/rehypejs/rehype-meta)
    — add metadata to the head of a document
*   [`rehype-document`](https://github.com/rehypejs/rehype-document)
    — wrap a fragment in a document

## Contribute

See [`contributing.md`][contributing] in [`rehypejs/.github`][health] for ways
to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/rehypejs/rehype-highlight/workflows/main/badge.svg

[build]: https://github.com/rehypejs/rehype-highlight/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/rehypejs/rehype-highlight.svg

[coverage]: https://codecov.io/github/rehypejs/rehype-highlight

[downloads-badge]: https://img.shields.io/npm/dm/rehype-highlight.svg

[downloads]: https://www.npmjs.com/package/rehype-highlight

[size-badge]: https://img.shields.io/bundlephobia/minzip/rehype-highlight.svg

[size]: https://bundlephobia.com/result?p=rehype-highlight

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/rehypejs/rehype/discussions

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[health]: https://github.com/rehypejs/.github

[contributing]: https://github.com/rehypejs/.github/blob/HEAD/contributing.md

[support]: https://github.com/rehypejs/.github/blob/HEAD/support.md

[coc]: https://github.com/rehypejs/.github/blob/HEAD/code-of-conduct.md

[license]: license

[author]: https://wooorm.com

[typescript]: https://www.typescriptlang.org

[unified]: https://github.com/unifiedjs/unified

[rehype]: https://github.com/rehypejs/rehype

[lowlight]: https://github.com/wooorm/lowlight

[register-alias]: https://github.com/wooorm/lowlight#lowregisteraliasname-alias

[register-language]: https://github.com/wooorm/lowlight#lowregisterlanguagename-syntax

[highlight-js]: https://github.com/isagalaev/highlight.js

[rehype-sanitize]: https://github.com/rehypejs/rehype-sanitize

[common]: https://github.com/wooorm/lowlight#syntaxes
