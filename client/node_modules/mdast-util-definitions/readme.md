# mdast-util-definitions

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] utility to find definitions by `identifier`.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`definitions(tree)`](#definitionstree)
    *   [`GetDefinition`](#getdefinition)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a tiny utility that lets you find definitions.

## When should I use this?

This utility can be useful because definitions can occur after the things that
reference them.
It’s small and protects against prototype pollution.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install mdast-util-definitions
```

In Deno with [`esm.sh`][esmsh]:

```js
import {definitions} from 'https://esm.sh/mdast-util-definitions@5'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {definitions} from 'https://esm.sh/mdast-util-definitions@5?bundle'
</script>
```

## Use

```js
import {fromMarkdown} from 'mdast-util-from-markdown'
import {definitions} from 'mdast-util-definitions'

const tree = fromMarkdown('[example]: https://example.com "Example"')

const definition = definitions(tree)

definition('example')
// => {type: 'definition', 'title': 'Example', …}

definition('foo')
// => null
```

## API

This package exports the identifier [`definitions`][api-definitions].
There is no default export.

### `definitions(tree)`

Find definitions in `tree`.

Uses CommonMark precedence, which means that earlier definitions are
preferred over duplicate later definitions.

###### Parameters

*   `tree` ([`Node`][node])
    — tree to check

###### Returns

Getter ([`GetDefinition`][api-getdefinition]).

### `GetDefinition`

Get a definition by identifier (TypeScript type).

###### Parameters

*   `identifier` (`string`, optional)
    — identifier of definition

###### Returns

Definition corresponding to `identifier` ([`Definition`][definition]) or
`null`.

## Types

This package is fully typed with [TypeScript][].
It exports the additional type  [`GetDefinition`][api-getdefinition].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

Use of `mdast-util-definitions` does not involve **[hast][]** or user content so
there are no openings for [cross-site scripting (XSS)][xss] attacks.
Additionally, safe guards are in place to protect against prototype poisoning.

## Related

*   [`unist-util-index`](https://github.com/syntax-tree/unist-util-index)
    — index property values or computed keys to nodes

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

[build-badge]: https://github.com/syntax-tree/mdast-util-definitions/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-definitions/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-definitions.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-definitions

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-definitions.svg

[downloads]: https://www.npmjs.com/package/mdast-util-definitions

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-definitions.svg

[size]: https://bundlephobia.com/result?p=mdast-util-definitions

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/syntax-tree/unist/discussions

[license]: license

[author]: https://wooorm.com

[npm]: https://docs.npmjs.com/cli/install

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[esmsh]: https://esm.sh

[typescript]: https://www.typescriptlang.org

[health]: https://github.com/syntax-tree/.github

[contributing]: https://github.com/syntax-tree/.github/blob/main/contributing.md

[support]: https://github.com/syntax-tree/.github/blob/main/support.md

[coc]: https://github.com/syntax-tree/.github/blob/main/code-of-conduct.md

[mdast]: https://github.com/syntax-tree/mdast

[node]: https://github.com/syntax-tree/unist#node

[definition]: https://github.com/syntax-tree/mdast#definition

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[hast]: https://github.com/syntax-tree/hast

[api-definitions]: #definitionstree

[api-getdefinition]: #getdefinition
