# unist-util-find-after

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[unist][] utility to find a node after another node.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`findAfter(parent, node|index[, test])`](#findafterparent-nodeindex-test)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This is a tiny utility that you can use to find a node after another node or
after an index in a parent.

## When should I use this?

This is super tiny.
You can of course do it yourself.
But this helps when integrating with the rest of unified and unist.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install unist-util-find-after
```

In Deno with [`esm.sh`][esmsh]:

```js
import {findAfter} from 'https://esm.sh/unist-util-find-after@4'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {findAfter} from 'https://esm.sh/unist-util-find-after@4?bundle'
</script>
```

## Use

```js
import {u} from 'unist-builder'
import {findAfter} from 'unist-util-find-after'

const tree = u('tree', [
  u('leaf', 'leaf 1'),
  u('parent', [u('leaf', 'leaf 2'), u('leaf', 'leaf 3')]),
  u('leaf', 'leaf 4'),
  u('parent', [u('leaf', 'leaf 5')]),
  u('leaf', 'leaf 6'),
  u('empty'),
  u('leaf', 'leaf 7')
])

console.log(findAfter(tree, 1, 'parent'))
```

Yields:

```js
{type: 'parent', children: [{ type: 'leaf', value: 'leaf 5'}]}
```

## API

This package exports the identifier [`findAfter`][api-findafter].
There is no default export.

### `findAfter(parent, node|index[, test])`

Find the first node in `parent` after another `node` or after an index,
that passes `test`.

###### Parameters

*   `parent` ([`Node`][node])
    — parent node
*   `index` (`number`)
    — index of child in `parent`
*   `child` ([`Node`][node])
    — child in `parent`
*   `test` ([`Test`][test])
    — `unist-util-is`-compatible test

###### Returns

Child of `parent` ([`Node`][node]) or `null`.

## Types

This package is fully typed with [TypeScript][].
It exports no additional types (types for the test are in `unist-util-is`).

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Related

*   [`unist-util-visit`](https://github.com/syntax-tree/unist-util-visit)
    — walk the tree
*   [`unist-util-visit-parents`](https://github.com/syntax-tree/unist-util-visit-parents)
    — walk the tree with a stack of parents
*   [`unist-util-filter`](https://github.com/syntax-tree/unist-util-filter)
    — create a new tree with all nodes that pass a test
*   [`unist-util-map`](https://github.com/syntax-tree/unist-util-map)
    — create a new tree with all nodes mapped by a given function
*   [`unist-util-flatmap`](https://gitlab.com/staltz/unist-util-flatmap)
    — create a new tree by mapping (to an array) with the provided function and
    then flattening
*   [`unist-util-find-before`](https://github.com/syntax-tree/unist-util-find-before)
    — find a node before another node
*   [`unist-util-find-all-after`](https://github.com/syntax-tree/unist-util-find-all-after)
    — find all nodes after another node
*   [`unist-util-find-all-before`](https://github.com/syntax-tree/unist-util-find-all-before)
    — find all nodes before another node
*   [`unist-util-find-all-between`](https://github.com/mrzmmr/unist-util-find-all-between)
    — find all nodes between two nodes
*   [`unist-util-remove`](https://github.com/syntax-tree/unist-util-remove)
    — remove nodes from a tree that pass a test
*   [`unist-util-select`](https://github.com/syntax-tree/unist-util-select)
    — select nodes with CSS-like selectors

## Contribute

See [`contributing.md`][contributing] in [`syntax-tree/.github`][health] for
ways to get started.
See [`support.md`][support] for ways to get help.

This project has a [Code of Conduct][coc].
By interacting with this repository, organisation, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/syntax-tree/unist-util-find-after/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/unist-util-find-after/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/unist-util-find-after.svg

[coverage]: https://codecov.io/github/syntax-tree/unist-util-find-after

[downloads-badge]: https://img.shields.io/npm/dm/unist-util-find-after.svg

[downloads]: https://www.npmjs.com/package/unist-util-find-after

[size-badge]: https://img.shields.io/bundlephobia/minzip/unist-util-find-after.svg

[size]: https://bundlephobia.com/result?p=unist-util-find-after

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

[test]: https://github.com/syntax-tree/unist-util-is#test

[api-findafter]: #findafterparent-nodeindex-test
