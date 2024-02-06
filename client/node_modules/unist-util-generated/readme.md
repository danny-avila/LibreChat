# unist-util-generated

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[unist][] utility to check if a node is generated.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`generated(node)`](#generatednode)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This utility can be used to check if a node is said to be
[generated][generated-term].

## When should I use this?

You can use this utility to check is generated.
Generated nodes were not in the source of the original file, and thus not
authored by a human.
This info can then be used to not emit lint messages for generated content.

You might also find the utility [`unist-util-position`][unist-util-position]
useful to get clean positional info.
To display positional info to users, use
[`unist-util-stringify-position`][unist-util-stringify-position].

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install unist-util-generated
```

In Deno with [`esm.sh`][esmsh]:

```js
import {generated} from 'https://esm.sh/unist-util-generated@2'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {generated} from 'https://esm.sh/unist-util-generated@2?bundle'
</script>
```

## Use

```js
import {generated} from 'unist-util-generated'

generated({}) // => true

generated({position: {start: {}, end: {}}}) // => true

generated({
  position: {start: {line: 1, column: 1}, end: {line: 1, column: 2}}
}) // => false
```

## API

This package exports the identifier [`generated`][generated].
There is no default export.

### `generated(node)`

Check if `node` is generated.

###### Parameters

*   `node` ([`Node`][node])
    — node to check

###### Returns

Whether `node` is generated (does not have positional info) (`boolean`).

## Types

This package is fully typed with [TypeScript][].
It exports no additional types.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Related

*   [`unist-util-position`](https://github.com/syntax-tree/unist-util-position)
    — get the position of nodes
*   [`unist-util-source`](https://github.com/syntax-tree/unist-util-source)
    — get the source of a node or position
*   [`unist-util-remove-position`](https://github.com/syntax-tree/unist-util-remove-position)
    — remove `position`s
*   [`unist-util-stringify-position`](https://github.com/syntax-tree/unist-util-stringify-position)
    — serialize positional info

## Contribute

See [`contributing.md`][contributing] in [`syntax-tree/.github`][health] for
ways to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definition -->

[build-badge]: https://github.com/syntax-tree/unist-util-generated/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/unist-util-generated/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/unist-util-generated.svg

[coverage]: https://codecov.io/github/syntax-tree/unist-util-generated

[downloads-badge]: https://img.shields.io/npm/dm/unist-util-generated.svg

[downloads]: https://www.npmjs.com/package/unist-util-generated

[size-badge]: https://img.shields.io/bundlephobia/minzip/unist-util-generated.svg

[size]: https://bundlephobia.com/result?p=unist-util-generated

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

[unist]: https://github.com/syntax-tree/unist

[node]: https://github.com/syntax-tree/unist#node

[generated-term]: https://github.com/syntax-tree/unist#generated

[unist-util-position]: https://github.com/syntax-tree/unist-util-position

[unist-util-stringify-position]: https://github.com/syntax-tree/unist-util-stringify-position

[generated]: #generatednode
