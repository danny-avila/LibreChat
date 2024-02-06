# mdast-util-to-string

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] utility to get the text content of a node.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`toString(value[, options])`](#tostringvalue-options)
    *   [`Options`](#options)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a tiny utility that gets the textual content of a node.

## When should I use this?

This utility is useful when you have a node, say a heading, and want to get the
text inside it.

This package does not serialize markdown, that’s what
[`mdast-util-to-markdown`][mdast-util-to-markdown] does.

Similar packages, [`hast-util-to-string`][hast-util-to-string] and
[`hast-util-to-text`][hast-util-to-text], do the same but on [hast][].

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install mdast-util-to-string
```

In Deno with [`esm.sh`][esmsh]:

```js
import {toString} from 'https://esm.sh/mdast-util-to-string@3'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {toString} from 'https://esm.sh/mdast-util-to-string@3?bundle'
</script>
```

## Use

```js
import {unified} from 'unified'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {toString} from 'mdast-util-to-string'

const tree = fromMarkdown('Some _emphasis_, **importance**, and `code`.')

console.log(toString(tree)) // => 'Some emphasis, importance, and code.'
```

## API

This package exports the identifier [`toString`][api-tostring].
There is no default export.

### `toString(value[, options])`

Get the text content of a node or list of nodes.

Prefers the node’s plain-text fields, otherwise serializes its children,
and if the given value is an array, serialize the nodes in it.

###### Parameters

*   `value` (`unknown`)
    — thing to serialize, typically [`Node`][node]
*   `options` ([`Options`][api-options], optional)
    — configuration

###### Returns

Serialized `value` (`string`).

### `Options`

Configuration (TypeScript type).

###### Fields

*   `includeImageAlt` (`boolean`, default: `true`)
    — whether to use `alt` for `image`s
*   `includeHtml` (`boolean`, default: `true`)
    — whether to use `value` of HTML

## Types

This package is fully typed with [TypeScript][].
It exports the additional type [`Options`][api-options].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

Use of `mdast-util-to-string` does not involve **[hast][]**, user content, or
change the tree, so there are no openings for [cross-site scripting (XSS)][xss]
attacks.

## Related

*   [`hast-util-to-string`](https://github.com/wooorm/rehype-minify/tree/main/packages/hast-util-to-string)
    — get text content in hast
*   [`hast-util-to-text`](https://github.com/syntax-tree/hast-util-to-text)
    — get text content in hast according to the `innerText` algorithm

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

[build-badge]: https://github.com/syntax-tree/mdast-util-to-string/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-to-string/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-to-string.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-to-string

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-to-string.svg

[downloads]: https://www.npmjs.com/package/mdast-util-to-string

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-to-string.svg

[size]: https://bundlephobia.com/result?p=mdast-util-to-string

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

[mdast]: https://github.com/syntax-tree/mdast

[mdast-util-to-markdown]: https://github.com/syntax-tree/mdast-util-to-markdown

[hast]: https://github.com/syntax-tree/hast

[hast-util-to-string]: https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-to-string

[hast-util-to-text]: https://github.com/syntax-tree/hast-util-to-text

[node]: https://github.com/syntax-tree/mdast#nodes

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[api-tostring]: #tostringvalue-options

[api-options]: #options
