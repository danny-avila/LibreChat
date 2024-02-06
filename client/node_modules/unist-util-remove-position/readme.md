# unist-util-remove-position

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[unist][] utility to remove positional info from a tree.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`removePosition(node[, force|options])`](#removepositionnode-forceoptions)
    *   [`Options`](#options)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This is a small utility that helps you remove the `position` field from nodes in
a unist tree.

## When should I use this?

Often, positional info is the whole reason, or an important reason, for using
ASTs.
Sometimes, especially when comparing trees, or when inserting one tree into
another, the positional info is at best useless and at worst harmful.
In those cases, you can use this utility to remove `position` fields from a
tree.

You might find the utility [`unist-util-position`][unist-util-position]
useful to instead get clean position info from a tree, or
[`unist-util-generated`][unist-util-generated] useful to check whether a node is
considered to be generated (not in the original input file).

You might also enjoy
[`unist-util-stringify-position`][unist-util-stringify-position] when you want
to display positional info to users.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install unist-util-remove-position
```

In Deno with [`esm.sh`][esmsh]:

```js
import {removePosition} from 'https://esm.sh/unist-util-remove-position@4'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {removePosition} from 'https://esm.sh/unist-util-remove-position@4?bundle'
</script>
```

## Use

```js
import {fromMarkdown} from 'mdast-util-from-markdown'
import {removePosition} from 'unist-util-remove-position'

const tree = fromMarkdown('Some _emphasis_, **importance**, and `code`.')

removePosition(tree, {force: true})

console.dir(tree, {depth: null})
```

Yields:

```js
{
  type: 'root',
  children: [
    {
      type: 'paragraph',
      children: [
        {type: 'text', value: 'Some '},
        {type: 'emphasis', children: [{type: 'text', value: 'emphasis'}]},
        {type: 'text', value: ', '},
        {type: 'strong', children: [{type: 'text', value: 'importance'}]},
        {type: 'text', value: ', and '},
        {type: 'inlineCode', value: 'code'},
        {type: 'text', value: '.'}
      ]
    }
  ]
}
```

## API

This package exports the identifier [`removePosition`][removeposition].
There is no default export.

### `removePosition(node[, force|options])`

Remove the `position` field from a tree.

###### Parameters

*   `node` ([`Node`][node])
    — tree to clean
*   `force` (`boolean`)
    — equivalent to `{force: boolean}`
*   `options` ([`Options`][options], optional)
    — configuration

###### Returns

The given, modified, `tree` ([`Node`][node]).

### `Options`

Configuration (TypeScript type).

###### Fields

*   `force` (`boolean`, default: `false`)
    — whether to use `delete` to remove `position` fields, the default is to
    set them to `undefined`

## Types

This package is fully typed with [TypeScript][].
It exports the additional type [`Options`][options].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

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

[build-badge]: https://github.com/syntax-tree/unist-util-remove-position/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/unist-util-remove-position/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/unist-util-remove-position.svg

[coverage]: https://codecov.io/github/syntax-tree/unist-util-remove-position

[downloads-badge]: https://img.shields.io/npm/dm/unist-util-remove-position.svg

[downloads]: https://www.npmjs.com/package/unist-util-remove-position

[size-badge]: https://img.shields.io/bundlephobia/minzip/unist-util-remove-position.svg

[size]: https://bundlephobia.com/result?p=unist-util-remove-position

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

[unist-util-position]: https://github.com/syntax-tree/unist-util-position

[unist-util-generated]: https://github.com/syntax-tree/unist-util-generated

[unist-util-stringify-position]: https://github.com/syntax-tree/unist-util-stringify-position

[removeposition]: #removepositionnode-forceoptions

[options]: #options
