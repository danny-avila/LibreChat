# rehype-katex

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[rehype][]** plugin to render `<span class=math-inline>` and
`<div class=math-display>` with [KaTeX][].

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`unified().use(rehypeKatex[, options])`](#unifieduserehypekatex-options)
*   [CSS](#css)
*   [Syntax tree](#syntax-tree)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a [unified][] ([rehype][]) plugin to render math.
You can combine it with [`remark-math`][remark-math] for math in markdown or add
`math-inline` and `math-display` classes in HTML.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**rehype** adds support for HTML to unified.
**hast** is the HTML AST that rehype uses.
This is a rehype plugin that transforms hast.

## When should I use this?

This project is useful as it renders math with KaTeX at compile time, which
means that there is no client side JavaScript needed.

A different plugin, [`rehype-mathjax`][rehype-mathjax], is similar but uses
[MathJax][] instead.

## Install

This package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).
In Node.js (version 12.20+, 14.14+, or 16.0+), install with [npm][]:

```sh
npm install rehype-katex
```

In Deno with [`esm.sh`][esmsh]:

```js
import rehypeKatex from 'https://esm.sh/rehype-katex@6'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import rehypeKatex from 'https://esm.sh/rehype-katex@6?bundle'
</script>
```

## Use

Say we have the following file `example.html`:

```html
<p>
  Lift(<span class="math math-inline">L</span>) can be determined by Lift Coefficient
  (<span class="math math-inline">C_L</span>) like the following equation.
</p>

<div class="math math-display">
  L = \frac{1}{2} \rho v^2 S C_L
</div>
```

And our module `example.js` looks as follows:

```js
import {read} from 'to-vfile'
import {unified} from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeKatex from 'rehype-katex'
import rehypeDocument from 'rehype-document'
import rehypeStringify from 'rehype-stringify'

const file = await unified()
  .use(rehypeParse, {fragment: true})
  .use(rehypeKatex)
  .use(rehypeDocument, {
    css: 'https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css'
  })
  .use(rehypeStringify)
  .process(await read('example.html'))

console.log(String(file))
```

Now running `node example.js` yields:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>example</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css">
</head>
<body>
<p>
  Lift(<span class="math math-inline"><span class="katex">…</span></span>) can be determined by Lift Coefficient
  (<span class="math math-inline"><span class="katex">…</span></span>) like the following equation.
</p>
<div class="math math-display"><span class="katex-display">…</span></div>
</body>
</html>
```

## API

This package exports no identifiers.
The default export is `rehypeKatex`.

### `unified().use(rehypeKatex[, options])`

Transform `<span class="math-inline">` and `<div class="math-display">` with
[KaTeX][].

##### `options`

Configuration (optional).
All options, except for `displayMode`, are passed to [KaTeX][katex-options].

###### `options.throwOnError`

Throw if a KaTeX parse error occurs (`boolean`, default: `false`).
See [KaTeX options][katex-options].

## CSS

The HTML produced by KaTeX requires CSS to render correctly.
You should use `katex.css` somewhere on the page where the math is shown to
style it properly.
At the time of writing, the last version is:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css" integrity="sha384-Xi8rHCmBmhbuyyhbI88391ZKP2dmfnOl4rT9ZfRI7mLTdk1wblIUnrIq35nqwEvC" crossorigin="anonymous">
```

<!-- To update the above, read the note in the monorepo readme. -->

## Syntax tree

This plugin transforms elements with a class name of either `math-inline` and/or
`math-display`.

## Types

This package is fully typed with [TypeScript][].
An extra `Options` type is exported, which models the accepted options.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

This plugin works with unified version 6+ and rehype version 4+.

## Security

Using `rehype-katex` should be safe assuming that you trust KaTeX.
Any vulnerability in it could open you to a [cross-site scripting (XSS)][xss]
attack.
Always be wary of user input and use [`rehype-sanitize`][rehype-sanitize].

When you don’t trust user content but do trust KaTeX, you can allow the classes
added by `remark-math` while disallowing anything else in the `rehype-sanitize`
schema, and run `rehype-katex` afterwards.
Like so:

```js
import rehypeSanitize, {defaultSchema} from 'rehype-sanitize'

const mathSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...defaultSchema.attributes.div,
      ['className', 'math', 'math-display']
    ],
    span: [
      ['className', 'math', 'math-inline']
    ]
  }
}

// …

unified()
  // …
  .use(rehypeSanitize, mathSanitizeSchema)
  .use(rehypeKatex)
  // …
```

## Related

*   [`rehype-mathjax`][rehype-mathjax]
    — same but with MathJax
*   [`rehype-highlight`](https://github.com/rehypejs/rehype-highlight)
    — highlight code blocks
*   [`rehype-autolink-headings`](https://github.com/rehypejs/rehype-autolink-headings)
    — add links to headings
*   [`rehype-sanitize`](https://github.com/rehypejs/rehype-sanitize)
    — sanitize HTML
*   [`rehype-document`](https://github.com/rehypejs/rehype-document)
    — wrap a document around the tree

## Contribute

See [`contributing.md`][contributing] in [`remarkjs/.github`][health] for ways
to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Junyoung Choi][author]

<!-- Definitions -->

[build-badge]: https://github.com/remarkjs/remark-math/workflows/main/badge.svg

[build]: https://github.com/remarkjs/remark-math/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/remarkjs/remark-math.svg

[coverage]: https://codecov.io/github/remarkjs/remark-math

[downloads-badge]: https://img.shields.io/npm/dm/rehype-katex.svg

[downloads]: https://www.npmjs.com/package/rehype-katex

[size-badge]: https://img.shields.io/bundlephobia/minzip/rehype-katex.svg

[size]: https://bundlephobia.com/result?p=rehype-katex

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/remarkjs/remark/discussions

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[health]: https://github.com/remarkjs/.github

[contributing]: https://github.com/remarkjs/.github/blob/HEAD/contributing.md

[support]: https://github.com/remarkjs/.github/blob/HEAD/support.md

[coc]: https://github.com/remarkjs/.github/blob/HEAD/code-of-conduct.md

[license]: https://github.com/remarkjs/remark-math/blob/main/license

[author]: https://rokt33r.github.io

[unified]: https://github.com/unifiedjs/unified

[rehype]: https://github.com/rehypejs/rehype

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[typescript]: https://www.typescriptlang.org

[rehype-sanitize]: https://github.com/rehypejs/rehype-sanitize

[katex]: https://github.com/Khan/KaTeX

[katex-options]: https://katex.org/docs/options.html

[mathjax]: https://www.mathjax.org

[remark-math]: ../remark-math

[rehype-mathjax]: ../rehype-mathjax
