# mdast-util-phrasing

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] utility to check if a node is phrasing content.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`phrasing(value)`](#phrasingvalue)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a tiny utility to check that a given [node][] is [phrasing
content][phrasing].

## When should I use this?

This utility is typically useful if you’re making other utilities.
It uses [`unist-util-is`][unist-util-is], which you can use for your own checks.

A different utility, [`hast-util-phrasing`][hast-util-phrasing], does the same
but on [hast][].

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install mdast-util-phrasing
```

In Deno with [`esm.sh`][esmsh]:

```js
import {phrasing} from 'https://esm.sh/mdast-util-phrasing@3'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {phrasing} from 'https://esm.sh/mdast-util-phrasing@3?bundle'
</script>
```

## Use

```js
import {phrasing} from 'mdast-util-phrasing'

phrasing({type: 'paragraph', children: [{type: 'text', value: 'Alpha'}]})
// => false

phrasing({type: 'strong', children: [{type: 'text', value: 'Delta'}]})
// => true
```

## API

This package exports the identifier [`phrasing`][api-phrasing].
There is no default export.

### `phrasing(value)`

Check if the given value is *[phrasing content][phrasing]*.

###### Parameters

*   `value` (`unknown`)
    — thing to check, typically [`Node`][node]

###### Returns

Whether `value` is phrasing content (`boolean`).

## Types

This package is fully typed with [TypeScript][].
It does not export extra types.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

Use of `mdast-util-phrasing` does not involve **[hast][]**, user content, or
change the tree, so there are no openings for [cross-site scripting (XSS)][xss]
attacks.

## Related

*   [`hast-util-phrasing`](https://github.com/syntax-tree/hast-util-phrasing)
    — check if a hast node is phrasing content
*   [`unist-util-is`](https://github.com/syntax-tree/unist-util-is)
    — check if a node passes a test

## Contribute

See [`contributing.md`][contributing] in [`syntax-tree/.github`][health] for
ways to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Victor Felder][author]

<!-- Definitions -->

[build-badge]: https://github.com/syntax-tree/mdast-util-phrasing/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-phrasing/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-phrasing.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-phrasing

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-phrasing.svg

[downloads]: https://www.npmjs.com/package/mdast-util-phrasing

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-phrasing.svg

[size]: https://bundlephobia.com/result?p=mdast-util-phrasing

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

[author]: https://draft.li

[health]: https://github.com/syntax-tree/.github

[contributing]: https://github.com/syntax-tree/.github/blob/main/contributing.md

[support]: https://github.com/syntax-tree/.github/blob/main/support.md

[coc]: https://github.com/syntax-tree/.github/blob/main/code-of-conduct.md

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[hast]: https://github.com/syntax-tree/hast

[mdast]: https://github.com/syntax-tree/mdast

[node]: https://github.com/syntax-tree/mdast#nodes

[phrasing]: https://github.com/syntax-tree/mdast#phrasingcontent

[unist-util-is]: https://github.com/syntax-tree/unist-util-is

[hast-util-phrasing]: https://github.com/syntax-tree/hast-util-phrasing

[api-phrasing]: #phrasingvalue
