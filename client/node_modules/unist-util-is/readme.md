# unist-util-is

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[unist][] utility to check if nodes pass a test.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`is(node[, test[, index, parent[, context]]])`](#isnode-test-index-parent-context)
    *   [`convert(test)`](#converttest)
    *   [`AssertAnything`](#assertanything)
    *   [`AssertPredicate`](#assertpredicate)
    *   [`Test`](#test)
    *   [`TestFunctionAnything`](#testfunctionanything)
    *   [`PredicateTest`](#predicatetest)
    *   [`TestFunctionPredicate`](#testfunctionpredicate)
*   [Examples](#examples)
    *   [Example of `convert`](#example-of-convert)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a small utility that checks that a node is a certain node.

## When should I use this?

Use this small utility if you find yourself repeating code for checking what
nodes are.

A similar package, [`hast-util-is-element`][hast-util-is-element], works on hast
elements.

For more advanced tests, [`unist-util-select`][unist-util-select] can be used
to match against CSS selectors.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install unist-util-is
```

In Deno with [`esm.sh`][esmsh]:

```js
import {is} from 'https://esm.sh/unist-util-is@5'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {is} from 'https://esm.sh/unist-util-is@5?bundle'
</script>
```

## Use

```js
import {is} from 'unist-util-is'

const node = {type: 'strong'}
const parent = {type: 'paragraph', children: [node]}

is() // => false
is({children: []}) // => false
is(node) // => true
is(node, 'strong') // => true
is(node, 'emphasis') // => false

is(node, node) // => true
is(parent, {type: 'paragraph'}) // => true
is(parent, {type: 'strong'}) // => false

is(node, test) // => false
is(node, test, 4, parent) // => false
is(node, test, 5, parent) // => true

function test(node, n) {
  return n === 5
}
```

## API

This package exports the identifiers [`convert`][convert] and [`is`][is].
There is no default export.

### `is(node[, test[, index, parent[, context]]])`

Check if `node` is a `Node` and whether it passes the given test.

###### Parameters

*   `node` (`unknown`)
    — thing to check, typically [`Node`][node]
*   `test` ([`Test`][test] or [`PredicateTest`][predicatetest], optional)
    — a check for a specific element
*   `index` (`number`, optional)
    — the node’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the node’s parent
*   `context` (`any`, optional)
    — context object (`this`) to call `test` with

###### Returns

Whether `node` is a [`Node`][node] and passes a test (`boolean`).

###### Throws

When an incorrect `test`, `index`, or `parent` is given.
There is no error thrown when `node` is not a node.

### `convert(test)`

Generate a check from a test.

Useful if you’re going to test many nodes, for example when creating a
utility where something else passes a compatible test.

The created function is a bit faster because it expects valid input only:
a `node`, `index`, and `parent`.

###### Parameters

*   `test` ([`Test`][test] or [`PredicateTest`][predicatetest], optional)
    — a check for a specific node

###### Returns

An assertion ([`AssertAnything`][assertanything] or
[`AssertPredicate`][assertpredicate]).

### `AssertAnything`

Check that an arbitrary value is a node, unaware of TypeScript inferral
(TypeScript type).

###### Parameters

*   `node` (`unknown`)
    — anything (typically a node)
*   `index` (`number`, optional)
    — the node’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the node’s parent

###### Returns

Whether this is a node and passes a test (`boolean`).

### `AssertPredicate`

Check that an arbitrary value is a specific node, aware of TypeScript
(TypeScript type).

###### Type parameters

*   `Kind` ([`Node`][node])
    — node type

###### Parameters

*   `node` (`unknown`)
    — anything (typically a node)
*   `index` (`number`, optional)
    — the node’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the node’s parent

###### Returns

Whether this is a node and passes a test (`node is Kind`).

### `Test`

Check for an arbitrary node, unaware of TypeScript inferral (TypeScript
type).

###### Type

```ts
type Test =
  | null
  | undefined
  | string
  | Record<string, unknown>
  | TestFunctionAnything
  | Array<string | Record<string, unknown> | TestFunctionAnything>
```

Checks that the given thing is a node, and then:

*   when `string`, checks that the node has that tag name
*   when `function`, see  [`TestFunctionAnything`][testfunctionanything]
*   when `object`, checks that all keys in test are in node, and that they have
    (strictly) equal values
*   when `Array`, checks if one of the subtests pass

### `TestFunctionAnything`

Check if a node passes a test, unaware of TypeScript inferral (TypeScript
type).

###### Parameters

*   `node` ([`Node`][node])
    — a node
*   `index` (`number`, optional)
    — the node’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the node’s parent

###### Returns

Whether this node passes the test (`boolean`).

### `PredicateTest`

Check for a node that can be inferred by TypeScript (TypeScript type).

###### Type

```ts
type PredicateTest<Kind extends Node> =
  | Kind['type']
  | Partial<Kind>
  | TestFunctionPredicate<Kind>
  | Array<Kind['type'] | Partial<Kind> | TestFunctionPredicate<Kind>>
```

See [`TestFunctionPredicate`][testfunctionpredicate].

### `TestFunctionPredicate`

Check if a node passes a certain node test (TypeScript type).

###### Type parameters

*   `Kind` ([`Node`][node])
    — node type

###### Parameters

*   `node` ([`Node`][node])
    — a node
*   `index` (`number`, optional)
    — the node’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the node’s parent

###### Returns

Whether this node passes the test (`node is Kind`).

## Examples

### Example of `convert`

```js
import {u} from 'unist-builder'
import {convert} from 'unist-util-is'

const test = convert('leaf')

const tree = u('tree', [
  u('node', [u('leaf', '1')]),
  u('leaf', '2'),
  u('node', [u('leaf', '3'), u('leaf', '4')]),
  u('leaf', '5')
])

const leafs = tree.children.filter((child, index) => test(child, index, tree))

console.log(leafs)
```

Yields:

```js
[{type: 'leaf', value: '2'}, {type: 'leaf', value: '5'}]
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional types [`AssertAnything`][assertanything],
[`AssertPredicate`][assertpredicate], [`Test`][test],
[`TestFunctionAnything`][testfunctionanything],
[`TestFunctionPredicate`][testfunctionpredicate], and
[`PredicateTest`][predicatetest].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Related

*   [`unist-util-find-after`](https://github.com/syntax-tree/unist-util-find-after)
    — find a node after another node
*   [`unist-util-find-before`](https://github.com/syntax-tree/unist-util-find-before)
    — find a node before another node
*   [`unist-util-find-all-after`](https://github.com/syntax-tree/unist-util-find-all-after)
    — find all nodes after another node
*   [`unist-util-find-all-before`](https://github.com/syntax-tree/unist-util-find-all-before)
    — find all nodes before another node
*   [`unist-util-find-all-between`](https://github.com/mrzmmr/unist-util-find-all-between)
    — find all nodes between two nodes
*   [`unist-util-filter`](https://github.com/syntax-tree/unist-util-filter)
    — create a new tree with nodes that pass a check
*   [`unist-util-remove`](https://github.com/syntax-tree/unist-util-remove)
    — remove nodes from tree

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

[build-badge]: https://github.com/syntax-tree/unist-util-is/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/unist-util-is/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/unist-util-is.svg

[coverage]: https://codecov.io/github/syntax-tree/unist-util-is

[downloads-badge]: https://img.shields.io/npm/dm/unist-util-is.svg

[downloads]: https://www.npmjs.com/package/unist-util-is

[size-badge]: https://img.shields.io/bundlephobia/minzip/unist-util-is.svg

[size]: https://bundlephobia.com/result?p=unist-util-is

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

[hast-util-is-element]: https://github.com/syntax-tree/hast-util-is-element

[unist-util-select]: https://github.com/syntax-tree/unist-util-select

[is]: #isnode-test-index-parent-context

[convert]: #converttest

[assertanything]: #assertanything

[assertpredicate]: #assertpredicate

[test]: #test

[testfunctionanything]: #testfunctionanything

[testfunctionpredicate]: #testfunctionpredicate

[predicatetest]: #predicatetest
