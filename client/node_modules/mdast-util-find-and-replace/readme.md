# mdast-util-find-and-replace

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] utility to find and replace things.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`findAndReplace(tree, find, replace[, options])`](#findandreplacetree-find-replace-options)
    *   [`Find`](#find)
    *   [`FindAndReplaceList`](#findandreplacelist)
    *   [`FindAndReplaceSchema`](#findandreplaceschema)
    *   [`FindAndReplaceTuple`](#findandreplacetuple)
    *   [`Options`](#options)
    *   [`RegExpMatchObject`](#regexpmatchobject)
    *   [`Replace`](#replace)
    *   [`ReplaceFunction`](#replacefunction)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a utility that lets you find patterns (`string`, `RegExp`) in
text and replace them with nodes.

## When should I use this?

This utility is typically useful when you have regexes and want to modify mdast.
One example is when you have some form of “mentions” (such as
`/@([a-z][_a-z0-9])\b/gi`) and want to create links to persons from them.

A similar package, [`hast-util-find-and-replace`][hast-util-find-and-replace]
does the same but on [hast][].

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and or 16.0+), install with [npm][]:

```sh
npm install mdast-util-find-and-replace
```

In Deno with [`esm.sh`][esmsh]:

```js
import {findAndReplace} from 'https://esm.sh/mdast-util-find-and-replace@2'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {findAndReplace} from 'https://esm.sh/mdast-util-find-and-replace@2?bundle'
</script>
```

## Use

```js
import {u} from 'unist-builder'
import {inspect} from 'unist-util-inspect'
import {findAndReplace} from 'mdast-util-find-and-replace'

const tree = u('paragraph', [
  u('text', 'Some '),
  u('emphasis', [u('text', 'emphasis')]),
  u('text', ' and '),
  u('strong', [u('text', 'importance')]),
  u('text', '.')
])

findAndReplace(tree, [
  [/and/gi, 'or'],
  [/emphasis/gi, 'em'],
  [/importance/gi, 'strong'],
  [
    /Some/g,
    function ($0) {
      return u('link', {url: '//example.com#' + $0}, [u('text', $0)])
    }
  ]
])

console.log(inspect(tree))
```

Yields:

```txt
paragraph[8]
├─0 link[1]
│   │ url: "//example.com#Some"
│   └─0 text "Some"
├─1 text " "
├─2 emphasis[1]
│   └─0 text "em"
├─3 text " "
├─4 text "or"
├─5 text " "
├─6 strong[1]
│   └─0 text "strong"
└─7 text "."
```

## API

This package exports the identifier [`findAndReplace`][api-findandreplace].
There is no default export.

### `findAndReplace(tree, find, replace[, options])`

Find patterns in a tree and replace them.

The algorithm searches the tree in *[preorder][]* for complete values in
[`Text`][text] nodes.
Partial matches are not supported.

###### Signatures

*   `findAndReplace(tree, find, replace[, options])`
*   `findAndReplace(tree, search[, options])`

###### Parameters

*   `tree` ([`Node`][node])
    — tree to change
*   `find` ([`Find`][api-find])
    — value to find and remove
*   `replace` ([`Replace`][api-replace])
    — thing to replace with
*   `search` ([`FindAndReplaceSchema`][api-findandreplaceschema] or
    [`FindAndReplaceList`][api-findandreplacelist])
    — several find and replaces
*   `options` ([`Options`][api-options])
    — configuration

###### Returns

Given, modified, tree ([`Node`][node]).

### `Find`

Pattern to find (TypeScript type).

Strings are escaped and then turned into global expressions.

###### Type

```ts
type Find = string | RegExp
```

### `FindAndReplaceList`

Several find and replaces, in array form (TypeScript type).

###### Type

```ts
type FindAndReplaceList = Array<FindAndReplaceTuple>
```

See [`FindAndReplaceTuple`][api-findandreplacetuple].

### `FindAndReplaceSchema`

Several find and replaces, in object form (TypeScript type).

###### Type

```ts
type FindAndReplaceSchema = Record<string, Replace>
```

See [`Replace`][api-replace].

### `FindAndReplaceTuple`

Find and replace in tuple form (TypeScript type).

###### Type

```ts
type FindAndReplaceTuple = [Find, Replace]
```

See [`Find`][api-find] and [`Replace`][api-replace].

### `Options`

Configuration (TypeScript type).

###### Fields

*   `ignore` ([`Test`][test], optional)
    — test for which elements to ignore

### `RegExpMatchObject`

Info on the match (TypeScript type).

###### Fields

*   `index` (`number`)
    — the index of the search at which the result was found
*   `input` (`string`)
    — a copy of the search string in the text node
*   `stack` ([`Array<Node>`][node])
    — all ancestors of the text node, where the last node is the text itself

### `Replace`

Thing to replace with (TypeScript type).

###### Type

```ts
type Replace = string | ReplaceFunction
```

See [`ReplaceFunction`][api-replacefunction].

### `ReplaceFunction`

Callback called when a search matches (TypeScript type).

###### Parameters

The parameters are the result of corresponding search expression:

*   `value` (`string`)
    — whole match
*   `...capture` (`Array<string>`)
    — matches from regex capture groups
*   `match` ([`RegExpMatchObject`][api-regexpmatchobject])
    — info on the match

###### Returns

Thing to replace with:

*   when `null`, `undefined`, `''`, remove the match
*   …or when `false`, do not replace at all
*   …or when `string`, replace with a text node of that value
*   …or when `Node` or `Array<Node>`, replace with those nodes

## Types

This package is fully typed with [TypeScript][].
It exports the additional types [`Find`][api-find],
[`FindAndReplaceList`][api-findandreplacelist],
[`FindAndReplaceSchema`][api-findandreplaceschema],
[`FindAndReplaceTuple`][api-findandreplacetuple],
[`Options`][api-options],
[`RegExpMatchObject`][api-regexpmatchobject],
[`Replace`][api-replace], and
[`ReplaceFunction`][api-replacefunction].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

Use of `mdast-util-find-and-replace` does not involve [hast][] or user content
so there are no openings for [cross-site scripting (XSS)][xss] attacks.

## Related

*   [`hast-util-find-and-replace`](https://github.com/syntax-tree/hast-util-find-and-replace)
    — find and replace in hast
*   [`hast-util-select`](https://github.com/syntax-tree/hast-util-select)
    — `querySelector`, `querySelectorAll`, and `matches`
*   [`unist-util-select`](https://github.com/syntax-tree/unist-util-select)
    — select unist nodes with CSS-like selectors

## Contribute

See [`contributing.md`][contributing] in [`syntax-tree/.github`][health] for
ways to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organisation, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definition -->

[build-badge]: https://github.com/syntax-tree/mdast-util-find-and-replace/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-find-and-replace/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-find-and-replace.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-find-and-replace

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-find-and-replace.svg

[downloads]: https://www.npmjs.com/package/mdast-util-find-and-replace

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-find-and-replace.svg

[size]: https://bundlephobia.com/result?p=mdast-util-find-and-replace

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

[mdast]: https://github.com/syntax-tree/mdast

[node]: https://github.com/syntax-tree/mdast#nodes

[preorder]: https://github.com/syntax-tree/unist#preorder

[text]: https://github.com/syntax-tree/mdast#text

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[test]: https://github.com/syntax-tree/unist-util-is#api

[hast-util-find-and-replace]: https://github.com/syntax-tree/hast-util-find-and-replace

[api-findandreplace]: #findandreplacetree-find-replace-options

[api-options]: #options

[api-find]: #find

[api-replace]: #replace

[api-replacefunction]: #replacefunction

[api-findandreplacelist]: #findandreplacelist

[api-findandreplaceschema]: #findandreplaceschema

[api-findandreplacetuple]: #findandreplacetuple

[api-regexpmatchobject]: #regexpmatchobject
