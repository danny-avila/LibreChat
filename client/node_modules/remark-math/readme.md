# remark-math

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[remark][]** plugin to support math (`$C_L$`).

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`unified().use(remarkMath[, options])`](#unifieduseremarkmath-options)
*   [Syntax](#syntax)
*   [HTML](#html)
*   [Syntax tree](#syntax-tree)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a [unified][] ([remark][]) plugin to add support for math.
You can use this to add support for parsing and serializing this syntax
extension.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**remark** adds support for markdown to unified.
**mdast** is the markdown AST that remark uses.
**micromark** is the markdown parser we use.
This is a remark plugin that adds support for the math syntax and AST to remark.

## When should I use this?

This project is useful when you want to support math in markdown.
Extending markdown with a syntax extension makes the markdown less portable.
LaTeX equations are also quite hard.
But this mechanism works well when you want authors, that have some LaTeX
experience, to be able to embed rich diagrams of math in scientific text.

## Install

This package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).
In Node.js (version 12.20+, 14.14+, or 16.0+), install with [npm][]:

```sh
npm install remark-math
```

In Deno with [Skypack][]:

```js
import remarkMath from 'https://cdn.skypack.dev/remark-math@5?dts'
```

In browsers with [Skypack][]:

```html
<script type="module">
  import remarkMath from 'https://cdn.skypack.dev/remark-math@5?min'
</script>
```

## Use

Say we have the following file `example.md`:

```markdown
Lift($L$) can be determined by Lift Coefficient ($C_L$) like the following
equation.

$$
L = \frac{1}{2} \rho v^2 S C_L
$$
```

And our module `example.js` looks as follows:

```js
import {read} from 'to-vfile'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeStringify from 'rehype-stringify'

main()

async function main() {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(await read('example.md'))

  console.log(String(file))
}
```

Now running `node example.js` yields:

```html
<p>Lift(<span class="math math-inline"><span class="katex">…</span></span>) can be determined by Lift Coefficient (<span class="math math-inline"><span class="katex">…</span></span>) like the following equation.</p>
<div class="math math-display"><span class="katex-display">…</span></div>
```

## API

This package exports no identifiers.
The default export is `remarkMath`.

### `unified().use(remarkMath[, options])`

Plugin to support math.

##### `options`

Configuration (optional).

###### `options.singleDollarTextMath`

Whether to support math (text) with a single dollar (`boolean`, default:
`true`).
Single dollars work in Pandoc and many other places, but often interfere with
“normal” dollars in text.

## Syntax

This plugin applies a micromark extensions to parse the syntax.
See its readme for parse details:

*   [`micromark-extension-math`](https://github.com/micromark/micromark-extension-math#syntax)

> 👉 **Note**: `$math$` works similar to `` `code` ``.
> That means escapes don’t work inside math but you can use more dollars around
> the math instead: `$$\raisebox{0.25em}{$\frac a b$}$$`

## HTML

This plugin integrates with [`remark-rehype`][remark-rehype].
When mdast (markdown AST) is turned into hast (the HTML AST) the math nodes
are turned into `<span class=math-inline>` and `<div class=math-block>`
elements.

## Syntax tree

This plugin applies one mdast utility to build and serialize the AST.
See its readme for the node types supported in the tree:

*   [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math#syntax-tree)

## Types

This package is fully typed with [TypeScript][].
It exports an extra `Options` type which models the interface of the accepted
options.

If you’re working with the syntax tree, make sure to import this plugin
somewhere in your types, as that registers the new node types in the tree.

```js
/** @typedef {import('remark-math')} */

import {visit} from 'unist-util-visit'

/** @type {import('unified').Plugin<[], import('mdast').Root>} */
export default function myRemarkPlugin() => {
  return (tree) => {
    visit(tree, (node) => {
      // `node` can now be one of the nodes for math.
    })
  }
}
```

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

This plugin works with unified version 6+ and remark version 14+.
The previous major (version 4) worked with remark 13.

## Security

Use of `remark-math` itself does not open you up to [cross-site scripting
(XSS)][xss] attacks.
Always be wary of user input and use [`rehype-sanitize`][rehype-sanitize].

## Related

*   [`remark-gfm`](https://github.com/remarkjs/remark-gfm)
    — support GFM (autolink literals, footnotes, strikethrough, tables,
    tasklists)
*   [`remark-frontmatter`](https://github.com/remarkjs/remark-frontmatter)
    — support frontmatter (YAML, TOML, and more)
*   [`remark-directive`](https://github.com/remarkjs/remark-directive)
    — support directives

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

[downloads-badge]: https://img.shields.io/npm/dm/remark-math.svg

[downloads]: https://www.npmjs.com/package/remark-math

[size-badge]: https://img.shields.io/bundlephobia/minzip/remark-math.svg

[size]: https://bundlephobia.com/result?p=remark-math

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/remarkjs/remark/discussions

[npm]: https://docs.npmjs.com/cli/install

[skypack]: https://www.skypack.dev

[health]: https://github.com/remarkjs/.github

[contributing]: https://github.com/remarkjs/.github/blob/HEAD/contributing.md

[support]: https://github.com/remarkjs/.github/blob/HEAD/support.md

[coc]: https://github.com/remarkjs/.github/blob/HEAD/code-of-conduct.md

[license]: https://github.com/remarkjs/remark-math/blob/main/license

[author]: https://rokt33r.github.io

[unified]: https://github.com/unifiedjs/unified

[remark]: https://github.com/remarkjs/remark

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[typescript]: https://www.typescriptlang.org

[remark-rehype]: https://github.com/remarkjs/remark-rehype

[rehype-sanitize]: https://github.com/rehypejs/rehype-sanitize
