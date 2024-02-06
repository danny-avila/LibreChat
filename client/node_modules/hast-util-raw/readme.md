# hast-util-raw

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[hast][] utility to parse the tree and semistandard `raw` nodes (strings of
HTML) again, keeping positional info okay.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`raw(tree[, file][, options])`](#rawtree-file-options)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a utility to parse a document again.
It passes each node and embedded raw HTML through an HTML parser
([`parse5`][parse5]), to recreate a tree exactly as how a browser would parse
it, while keeping the original data and positional info intact.

## When should I use this?

This utility is particularly useful when coming from markdown and wanting to
support HTML embedded inside that markdown (which requires passing
`allowDangerousHtml: true` to `mdast-util-to-hast`).
Markdown dictates how, say, a list item or emphasis can be parsed.
We can use that to turn the markdown syntax tree into an HTML syntax tree.
But markdown also dictates that things that look like HTML, are passed through
untouched, even when it just looks like XML but doesn’t really make sense, so we
can’t normally use these strings of “HTML” to create an HTML syntax tree.
This utility can.
It can be used to take those strings of HTML and include them into the syntax
tree as actual nodes.

If your final result is HTML and you trust content, then “strings” are fine
(you can pass `allowDangerousHtml: true` to `hast-util-to-html`, which passes
HTML through untouched).
But there are two main cases where a proper syntax tree is preferred:

*   hast utilities need a proper syntax tree as they operate on actual nodes to
    inspect or transform things, they can’t operate on strings of HTML
*   other output formats (React, MDX, etc) need actual nodes and can’t handle
    strings of HTML

The plugin [`rehype-raw`][rehype-raw] wraps this utility at a higher-level
(easier) abstraction.

## Install

This package is [ESM only][esm].
In Node.js (version 12.20+, 14.14+, 16.0+, or 18.0+), install with [npm][]:

```sh
npm install hast-util-raw
```

In Deno with [`esm.sh`][esmsh]:

```js
import {raw} from 'https://esm.sh/hast-util-raw@7'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {raw} from 'https://esm.sh/hast-util-raw@7?bundle'
</script>
```

## Use

```js
import {h} from 'hastscript'
import {raw} from 'hast-util-raw'

const tree = h('div', [h('h1', ['Foo ', h('h2', 'Bar'), ' Baz'])])

const reformatted = raw(tree)

console.log(reformatted)
```

Yields:

```js
{ type: 'element',
  tagName: 'div',
  properties: {},
  children:
   [ { type: 'element',
       tagName: 'h1',
       properties: {},
       children: [Object] },
     { type: 'element',
       tagName: 'h2',
       properties: {},
       children: [Object] },
     { type: 'text', value: ' Baz' } ] }
```

## API

This package exports the identifier `raw`.
There is no default export.

### `raw(tree[, file][, options])`

Parse the tree and raw nodes (strings of HTML) again, keeping positional info
okay.

> 👉 **Note**: `tree` should have positional info and `file`, when given, must
> be a [vfile][] corresponding to `tree`.

##### `options`

Configuration (optional).

###### `options.passThrough`

List of custom hast node types to pass through (keep) in hast (`Array<string>`,
default: `[]`).
If the passed through nodes have children, those children are expected to be
hast and will be handled by this utility.

## Types

This package is fully typed with [TypeScript][].
It exports the additional type `Options`.

It also registers the `Raw` node type with `@types/hast`.
If you’re working with the syntax tree, make sure to import this utility
somewhere in your types, as that registers the new node types in the tree.

```js
/**
 * @typedef {import('hast-util-raw')}
 */

import {visit} from 'unist-util-visit'

/** @type {import('hast').Root} */
const tree = getHastNodeSomeHow()

visit(tree, (node) => {
  // `node` can now be a `raw` node.
})
```

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, 16.0+, and 18.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

Use of `hast-util-raw` can open you up to a [cross-site scripting (XSS)][xss]
attack as `raw` nodes are unsafe.
The following example shows how a raw node is used to inject a script that runs
when loaded in a browser.

```js
raw(u('root', [u('raw', '<script>alert(1)</script>')]))
```

Yields:

```html
<script>alert(1)</script>
```

Either do not use this utility in combination with user input, or use
[`hast-util-santize`][hast-util-sanitize].

## Related

*   [`mdast-util-to-hast`](https://github.com/syntax-tree/mdast-util-to-hast)
    — transform mdast to hast
*   [`rehype-raw`](https://github.com/rehypejs/rehype-raw)
    — rehype plugin

## Contribute

See [`contributing.md`][contributing] in [`syntax-tree/.github`][health] for
ways to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/syntax-tree/hast-util-raw/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/hast-util-raw/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/hast-util-raw.svg

[coverage]: https://codecov.io/github/syntax-tree/hast-util-raw

[downloads-badge]: https://img.shields.io/npm/dm/hast-util-raw.svg

[downloads]: https://www.npmjs.com/package/hast-util-raw

[size-badge]: https://img.shields.io/bundlephobia/minzip/hast-util-raw.svg

[size]: https://bundlephobia.com/result?p=hast-util-raw

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/syntax-tree/unist/discussions

[npm]: https://docs.npmjs.com/cli/install

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[esmsh]: https://esm.sh

[typescript]: https://www.typescriptlang.org

[license]: license

[author]: https://wooorm.com

[health]: https://github.com/syntax-tree/.github

[contributing]: https://github.com/syntax-tree/.github/blob/main/contributing.md

[support]: https://github.com/syntax-tree/.github/blob/main/support.md

[coc]: https://github.com/syntax-tree/.github/blob/main/code-of-conduct.md

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[hast]: https://github.com/syntax-tree/hast

[hast-util-sanitize]: https://github.com/syntax-tree/hast-util-sanitize

[vfile]: https://github.com/vfile/vfile

[rehype-raw]: https://github.com/rehypejs/rehype-raw

[parse5]: https://github.com/inikulin/parse5
