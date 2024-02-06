# mdast-util-gfm-autolink-literal

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] extensions to parse and serialize [GFM][] autolink literals.

## Contents

*   [What is this?](#what-is-this)
*   [When to use this](#when-to-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`gfmAutolinkLiteralFromMarkdown`](#gfmautolinkliteralfrommarkdown)
    *   [`gfmAutolinkLiteralToMarkdown`](#gfmautolinkliteraltomarkdown)
*   [HTML](#html)
*   [Syntax](#syntax)
*   [Syntax tree](#syntax-tree)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package contains two extensions that add support for GFM autolink literals
syntax in markdown to [mdast][].
These extensions plug into
[`mdast-util-from-markdown`][mdast-util-from-markdown] (to support parsing
GFM autolinks in markdown into a syntax tree) and
[`mdast-util-to-markdown`][mdast-util-to-markdown] (to support serializing
GFM autolinks in syntax trees to markdown).

GitHub employs different algorithms to autolink: one at parse time and one at
transform time (similar to how `@mentions` are done at transform time).
This difference can be observed because character references and escapes are
handled differently.
But also because issues/PRs/comments omit (perhaps by accident?) the second
algorithm for `www.`, `http://`, and `https://` links (but not for email links).

As the corresponding micromark extension
[`micromark-extension-gfm-autolink-literal`][extension] is a syntax extension,
it can only perform the first algorithm.
The tree extension `gfmAutolinkLiteralFromMarkdown` from this package can
perform the second algorithm, and as they are combined, both are done.

## When to use this

You can use these extensions when you are working with
`mdast-util-from-markdown` and `mdast-util-to-markdown` already.

When working with `mdast-util-from-markdown`, you must combine this package
with
[`micromark-extension-gfm-autolink-literal`][extension].

When you don’t need a syntax tree, you can use [`micromark`][micromark]
directly with `micromark-extension-gfm-autolink-literal`.

When you are working with syntax trees and want all of GFM, use
[`mdast-util-gfm`][mdast-util-gfm] instead.

All these packages are used [`remark-gfm`][remark-gfm], which
focusses on making it easier to transform content by abstracting these
internals away.

This utility does not handle how markdown is turned to HTML.
That’s done by [`mdast-util-to-hast`][mdast-util-to-hast].

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install mdast-util-gfm-autolink-literal
```

In Deno with [`esm.sh`][esmsh]:

```js
import {gfmAutolinkLiteralFromMarkdown, gfmAutolinkLiteralToMarkdown} from 'https://esm.sh/mdast-util-gfm-autolink-literal@1'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {gfmAutolinkLiteralFromMarkdown, gfmAutolinkLiteralToMarkdown} from 'https://esm.sh/mdast-util-gfm-autolink-literal@1?bundle'
</script>
```

## Use

Say our document `example.md` contains:

```markdown
www.example.com, https://example.com, and contact@example.com.
```

…and our module `example.js` looks as follows:

```js
import fs from 'node:fs/promises'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {toMarkdown} from 'mdast-util-to-markdown'
import {gfmAutolinkLiteral} from 'micromark-extension-gfm-autolink-literal'
import {gfmAutolinkLiteralFromMarkdown, gfmAutolinkLiteralToMarkdown} from 'mdast-util-gfm-autolink-literal'

const doc = await fs.readFile('example.md')

const tree = fromMarkdown(doc, {
  extensions: [gfmAutolinkLiteral],
  mdastExtensions: [gfmAutolinkLiteralFromMarkdown]
})

console.log(tree)

const out = toMarkdown(tree, {extensions: [gfmAutolinkLiteralToMarkdown]})

console.log(out)
```

…now running `node example.js` yields (positional info removed for brevity):

```js
{
  type: 'root',
  children: [
    {
      type: 'paragraph',
      children: [
        {
          type: 'link',
          title: null,
          url: 'http://www.example.com',
          children: [{type: 'text', value: 'www.example.com'}]
        },
        {type: 'text', value: ', '},
        {
          type: 'link',
          title: null,
          url: 'https://example.com',
          children: [{type: 'text', value: 'https://example.com'}]
        },
        {type: 'text', value: ', and '},
        {
          type: 'link',
          title: null,
          url: 'mailto:contact@example.com',
          children: [{type: 'text', value: 'contact@example.com'}]
        },
        {type: 'text', value: '.'}
      ]
    }
  ]
}
```

```markdown
[www.example.com](http://www.example.com), <https://example.com>, and <contact@example.com>.
```

## API

This package exports the identifiers
[`gfmAutolinkLiteralFromMarkdown`][api-gfmautolinkliteralfrommarkdown] and
[`gfmAutolinkLiteralToMarkdown`][api-gfmautolinkliteraltomarkdown].
There is no default export.

### `gfmAutolinkLiteralFromMarkdown`

Extension for [`mdast-util-from-markdown`][mdast-util-from-markdown] to enable
GFM autolink literals ([`FromMarkdownExtension`][frommarkdownextension]).

### `gfmAutolinkLiteralToMarkdown`

Extension for [`mdast-util-to-markdown`][mdast-util-to-markdown] to enable
GFM autolink literals ([`ToMarkdownExtension`][tomarkdownextension]).

## HTML

This utility does not handle how markdown is turned to HTML.
That’s done by [`mdast-util-to-hast`][mdast-util-to-hast].

## Syntax

See [Syntax in `micromark-extension-gfm-autolink-literal`][syntax].

## Syntax tree

There are no interfaces added to **[mdast][]** by this utility, as it reuses
the existing **[Link][dfn-link]** interface.

## Types

This package is fully typed with [TypeScript][].
It does not export additional types.

The `Link` type of the mdast nodes is exposed from `@types/mdast`.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

This plugin works with `mdast-util-from-markdown` version 1+ and
`mdast-util-to-markdown` version 1+.

## Related

*   [`remarkjs/remark-gfm`][remark-gfm]
    — remark plugin to support GFM
*   [`syntax-tree/mdast-util-gfm`][mdast-util-gfm]
    — same but all of GFM (autolink literals, footnotes, strikethrough, tables,
    tasklists)
*   [`micromark/micromark-extension-gfm-autolink-literal`][extension]
    — micromark extension to parse GFM autolink literals

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

[build-badge]: https://github.com/syntax-tree/mdast-util-gfm-autolink-literal/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-gfm-autolink-literal/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-gfm-autolink-literal.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-gfm-autolink-literal

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-gfm-autolink-literal.svg

[downloads]: https://www.npmjs.com/package/mdast-util-gfm-autolink-literal

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-gfm-autolink-literal.svg

[size]: https://bundlephobia.com/result?p=mdast-util-gfm-autolink-literal

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

[contributing]: https://github.com/syntax-tree/.github/blob/HEAD/contributing.md

[support]: https://github.com/syntax-tree/.github/blob/HEAD/support.md

[coc]: https://github.com/syntax-tree/.github/blob/HEAD/code-of-conduct.md

[mdast]: https://github.com/syntax-tree/mdast

[mdast-util-gfm]: https://github.com/syntax-tree/mdast-util-gfm

[mdast-util-from-markdown]: https://github.com/syntax-tree/mdast-util-from-markdown

[mdast-util-to-markdown]: https://github.com/syntax-tree/mdast-util-to-markdown

[mdast-util-to-hast]: https://github.com/syntax-tree/mdast-util-to-hast

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[micromark]: https://github.com/micromark/micromark

[extension]: https://github.com/micromark/micromark-extension-gfm-autolink-literal

[syntax]: https://github.com/micromark/micromark-extension-gfm-autolink-literal#syntax

[gfm]: https://github.github.com/gfm/

[dfn-link]: https://github.com/syntax-tree/mdast#link

[frommarkdownextension]: https://github.com/syntax-tree/mdast-util-from-markdown#extension

[tomarkdownextension]: https://github.com/syntax-tree/mdast-util-to-markdown#options

[api-gfmautolinkliteralfrommarkdown]: #gfmautolinkliteralfrommarkdown

[api-gfmautolinkliteraltomarkdown]: #gfmautolinkliteraltomarkdown
