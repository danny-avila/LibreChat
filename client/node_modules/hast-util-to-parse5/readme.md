# hast-util-to-parse5

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[hast][] utility to generate [`parse5`][parse5]s [AST][parse5-node].

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`toParse5(tree[, space|options])`](#toparse5tree-spaceoptions)
    *   [`Options`](#options)
    *   [`Space`](#space)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a utility that can turn a hast syntax tree into `parse5`s AST.
Why not use a Parse5 adapter, you might ask?
Well, because it’s more code weight to use adapters, and more fragile.

## When should I use this?

This package is useful when working with `parse5`, and for some reason want to
generate its AST again.
The inverse utility, [`hast-util-from-parse5`][hast-util-from-parse5], is more
likely what you want.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install hast-util-to-parse5
```

In Deno with [`esm.sh`][esmsh]:

```js
import {toParse5} from 'https://esm.sh/hast-util-to-parse5@7'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {toParse5} from 'https://esm.sh/hast-util-to-parse5@7?bundle'
</script>
```

## Use

```js
import {toParse5} from 'hast-util-to-parse5'

const tree = toParse5({
  type: 'element',
  tagName: 'h1',
  properties: {},
  children: [{type: 'text', value: 'World!'}]
})

console.log(tree)
```

Yields:

```js
{ nodeName: 'h1',
  tagName: 'h1',
  attrs: [],
  namespaceURI: 'http://www.w3.org/1999/xhtml',
  childNodes: [ { nodeName: '#text', value: 'World!', parentNode: [Circular] } ] }
```

## API

This package exports the identifier [`toParse5`][toparse5].
There is no default export.

### `toParse5(tree[, space|options])`

Transform a hast tree to Parse5’s AST.

###### Parameters

*   `tree` ([`HastNode`][hast-node])
    — tree to transform
*   `space` ([`Space`][space], optional)
    — same as `{space: space}`
*   `options` ([`Options`][options], optional)
    — configuration

###### Returns

`parse5` node ([`Parse5Node`][parse5-node]).

### `Options`

Configuration (TypeScript type).

###### Fields

*   `space` ([`Space`][space], optional)
    — which space the document is in

### `Space`

Namespace (TypeScript type).

###### Type

```ts
type Space = 'html' | 'svg'
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional types [`Options`][options] and [`Space`][space].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

Use of `hast-util-to-parse5` can open you up to a
[cross-site scripting (XSS)][xss] attack if the hast tree is unsafe.

## Related

*   [`hast-util-from-parse5`](https://github.com/syntax-tree/hast-util-from-parse5)
    — transform from Parse5’s AST to hast
*   [`hast-util-to-nlcst`](https://github.com/syntax-tree/hast-util-to-nlcst)
    — transform hast to nlcst
*   [`hast-util-to-mdast`](https://github.com/syntax-tree/hast-util-to-mdast)
    — transform hast to mdast
*   [`hast-util-to-xast`](https://github.com/syntax-tree/hast-util-to-xast)
    — transform hast to xast
*   [`mdast-util-to-hast`](https://github.com/syntax-tree/mdast-util-to-hast)
    — transform mdast to hast
*   [`mdast-util-to-nlcst`](https://github.com/syntax-tree/mdast-util-to-nlcst)
    — transform mdast to nlcst

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

[build-badge]: https://github.com/syntax-tree/hast-util-to-parse5/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/hast-util-to-parse5/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/hast-util-to-parse5.svg

[coverage]: https://codecov.io/github/syntax-tree/hast-util-to-parse5

[downloads-badge]: https://img.shields.io/npm/dm/hast-util-to-parse5.svg

[downloads]: https://www.npmjs.com/package/hast-util-to-parse5

[size-badge]: https://img.shields.io/bundlephobia/minzip/hast-util-to-parse5.svg

[size]: https://bundlephobia.com/result?p=hast-util-to-parse5

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

[hast-node]: https://github.com/syntax-tree/hast#nodes

[parse5]: https://github.com/inikulin/parse5

[parse5-node]: https://github.com/inikulin/parse5/blob/master/packages/parse5/lib/tree-adapters/default.ts

[hast-util-from-parse5]: https://github.com/syntax-tree/hast-util-from-parse5

[toparse5]: #toparse5tree-spaceoptions

[options]: #options

[space]: #space
