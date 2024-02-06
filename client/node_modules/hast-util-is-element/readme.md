# hast-util-is-element

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[hast][] utility to check if a node is a (certain) element.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`isElement(node[, test[, index, parent[, context]]])`](#iselementnode-test-index-parent-context)
    *   [`convertElement(test)`](#convertelementtest)
    *   [`AssertAnything`](#assertanything)
    *   [`AssertPredicate`](#assertpredicate)
    *   [`Test`](#test)
    *   [`TestFunctionAnything`](#testfunctionanything)
    *   [`PredicateTest`](#predicatetest)
    *   [`TestFunctionPredicate`](#testfunctionpredicate)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a small utility that checks that a node is a certain element.

## When should I use this?

Use this small utility if you find yourself repeating code for checking what
elements nodes are.

A similar package, [`unist-util-is`][unist-util-is], works on any unist node.

For more advanced tests, [`hast-util-select`][hast-util-select] can be used
to match against CSS selectors.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install hast-util-is-element
```

In Deno with [`esm.sh`][esmsh]:

```js
import {isElement} from 'https://esm.sh/hast-util-is-element@2'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {isElement} from 'https://esm.sh/hast-util-is-element@2?bundle'
</script>
```

## Use

```js
import {isElement} from 'hast-util-is-element'

isElement({type: 'text', value: 'foo'}) // => false
isElement({type: 'element', tagName: 'a'}) // => true
isElement({type: 'element', tagName: 'a'}, 'a') // => true
isElement({type: 'element', tagName: 'a'}, ['a', 'area']) // => true
```

## API

This package exports the identifiers [`isElement`][iselement] and
[`convertElement`][convertelement].
There is no default export.

### `isElement(node[, test[, index, parent[, context]]])`

Check if `node` is an `Element` and whether it passes the given test.

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

Whether `node` is an [`Element`][element] and passes a test (`boolean`).

###### Throws

When an incorrect `test`, `index`, or `parent` is given.
There is no error thrown when `node` is not a node or not an element.

### `convertElement(test)`

Generate a check from a test.

Useful if you’re going to test many nodes, for example when creating a
utility where something else passes a compatible test.

The created function is a bit faster because it expects valid input only:
a `node`, `index`, and `parent`.

###### Parameters

*   `test` ([`Test`][test] or [`PredicateTest`][predicatetest], optional)
    — a check for a specific element

###### Returns

An assertion ([`AssertAnything`][assertanything] or
[`AssertPredicate`][assertpredicate]).

### `AssertAnything`

Check that an arbitrary value is an element, unaware of TypeScript inferral
(TypeScript type).

###### Parameters

*   `node` (`unknown`)
    — anything (typically a node)
*   `index` (`number`, optional)
    — the node’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the node’s parent

###### Returns

Whether this is an element and passes a test (`boolean`).

### `AssertPredicate`

Check that an arbitrary value is a specific element, aware of TypeScript
(TypeScript type).

###### Type parameters

*   `T` ([`Element`][element])
    — element type

###### Parameters

*   `node` (`unknown`)
    — anything (typically a node)
*   `index` (`number`, optional)
    — the node’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the node’s parent

###### Returns

Whether this is an element and passes a test (`node is T`).

### `Test`

Check for an arbitrary element, unaware of TypeScript inferral (TypeScript
type).

###### Type

```ts
type Test = null | undefined | string | TestFunctionAnything | Array<string | TestFunctionAnything>
```

Checks that the given thing is an element, and then:

*   when `string`, checks that the element has that tag name
*   when `function`, see  [`TestFunctionAnything`][testfunctionanything]
*   when `Array`, checks if one of the subtests pass

### `TestFunctionAnything`

Check if an element passes a test, unaware of TypeScript inferral (TypeScript
type).

###### Parameters

*   `element` ([`Element`][element])
    — an element
*   `index` (`number`, optional)
    — the element’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the element’s parent

###### Returns

Whether this element passes the test (`boolean`).

### `PredicateTest`

Check for an element that can be inferred by TypeScript (TypeScript type).

###### Type

```ts
type PredicateTest<T extends Element> =
  | T['tagName']
  | TestFunctionPredicate<T>
  | Array<T['tagName'] | TestFunctionPredicate<T>>
```

See [`TestFunctionPredicate`][testfunctionpredicate].

### `TestFunctionPredicate`

Check if an element passes a certain node test (TypeScript type).

###### Type parameters

*   `T` ([`Element`][element])
    — element type

###### Parameters

*   `element` ([`Element`][element])
    — an element
*   `index` (`number`, optional)
    — the element’s position in its parent
*   `parent` ([`Node`][node], optional)
    — the element’s parent

###### Returns

Whether this element passes the test (`element is T`).

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

## Security

`hast-util-is-element` does not change the syntax tree so there are no openings
for [cross-site scripting (XSS)][xss] attacks.

## Related

*   [`hast-util-has-property`](https://github.com/syntax-tree/hast-util-has-property)
    — check if a node has a property
*   [`hast-util-is-body-ok-link`](https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-is-body-ok-link)
    — check if a node is “Body OK” link element
*   [`hast-util-is-conditional-comment`](https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-is-conditional-comment)
    — check if a node is a conditional comment
*   [`hast-util-is-css-link`](https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-is-css-link)
    — check if a node is a CSS link element
*   [`hast-util-is-css-style`](https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-is-css-style)
    — check if a node is a CSS style element
*   [`hast-util-embedded`](https://github.com/syntax-tree/hast-util-embedded)
    — check if a node is an embedded element
*   [`hast-util-heading`](https://github.com/syntax-tree/hast-util-heading)
    — check if a node is a heading element
*   [`hast-util-interactive`](https://github.com/syntax-tree/hast-util-interactive)
    — check if a node is interactive
*   [`hast-util-is-javascript`](https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-is-javascript)
    — check if a node is a JavaScript script element
*   [`hast-util-labelable`](https://github.com/syntax-tree/hast-util-labelable)
    — check whether a node is labelable
*   [`hast-util-phrasing`](https://github.com/syntax-tree/hast-util-phrasing)
    — check if a node is phrasing content
*   [`hast-util-script-supporting`](https://github.com/syntax-tree/hast-util-script-supporting)
    — check if a node is a script-supporting element
*   [`hast-util-sectioning`](https://github.com/syntax-tree/hast-util-sectioning)
    — check if a node is a sectioning element
*   [`hast-util-transparent`](https://github.com/syntax-tree/hast-util-transparent)
    — check if a node is a transparent element
*   [`hast-util-whitespace`](https://github.com/syntax-tree/hast-util-whitespace)
    — check if a node is inter-element whitespace

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

[build-badge]: https://github.com/syntax-tree/hast-util-is-element/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/hast-util-is-element/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/hast-util-is-element.svg

[coverage]: https://codecov.io/github/syntax-tree/hast-util-is-element

[downloads-badge]: https://img.shields.io/npm/dm/hast-util-is-element.svg

[downloads]: https://www.npmjs.com/package/hast-util-is-element

[size-badge]: https://img.shields.io/bundlephobia/minzip/hast-util-is-element.svg

[size]: https://bundlephobia.com/result?p=hast-util-is-element

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

[hast]: https://github.com/syntax-tree/hast

[node]: https://github.com/syntax-tree/unist#node

[element]: https://github.com/syntax-tree/hast#element

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[unist-util-is]: https://github.com/syntax-tree/unist-util-is

[hast-util-select]: https://github.com/syntax-tree/hast-util-select

[iselement]: #iselementnode-test-index-parent-context

[convertelement]: #convertelementtest

[assertanything]: #assertanything

[assertpredicate]: #assertpredicate

[test]: #test

[testfunctionanything]: #testfunctionanything

[predicatetest]: #predicatetest

[testfunctionpredicate]: #testfunctionpredicate
