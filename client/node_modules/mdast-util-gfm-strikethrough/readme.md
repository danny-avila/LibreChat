# mdast-util-gfm-strikethrough

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] extensions to parse and serialize [GFM][] strikethrough.

## Contents

*   [What is this?](#what-is-this)
*   [When to use this](#when-to-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`gfmStrikethroughFromMarkdown`](#gfmstrikethroughfrommarkdown)
    *   [`gfmStrikethroughToMarkdown`](#gfmstrikethroughtomarkdown)
*   [HTML](#html)
*   [Syntax](#syntax)
*   [Syntax tree](#syntax-tree)
    *   [Nodes](#nodes)
    *   [Content model](#content-model)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package contains two extensions that add support for GFM strikethrough
syntax in markdown to [mdast][].
These extensions plug into
[`mdast-util-from-markdown`][mdast-util-from-markdown] (to support parsing
strikethrough in markdown into a syntax tree) and
[`mdast-util-to-markdown`][mdast-util-to-markdown] (to support serializing
strikethrough in syntax trees to markdown).

## When to use this

You can use these extensions when you are working with
`mdast-util-from-markdown` and `mdast-util-to-markdown` already.

When working with `mdast-util-from-markdown`, you must combine this package
with [`micromark-extension-gfm-strikethrough`][extension].

When you don’t need a syntax tree, you can use [`micromark`][micromark]
directly with `micromark-extension-gfm-strikethrough`.

When you are working with syntax trees and want all of GFM, use
[`mdast-util-gfm`][mdast-util-gfm] instead.

All these packages are used [`remark-gfm`][remark-gfm], which
focusses on making it easier to transform content by abstracting these
internals away.

This utility does not handle how markdown is turned to HTML.
That’s done by [`mdast-util-to-hast`][mdast-util-to-hast].
If you want a different element, you should configure that utility.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install mdast-util-gfm-strikethrough
```

In Deno with [`esm.sh`][esmsh]:

```js
import {gfmStrikethroughFromMarkdown, gfmStrikethroughToMarkdown} from 'https://esm.sh/mdast-util-gfm-strikethrough@1'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {gfmStrikethroughFromMarkdown, gfmStrikethroughToMarkdown} from 'https://esm.sh/mdast-util-gfm-strikethrough@1?bundle'
</script>
```

## Use

Say our document `example.md` contains:

```markdown
*Emphasis*, **importance**, and ~~strikethrough~~.
```

…and our module `example.js` looks as follows:

```js
import fs from 'node:fs/promises'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {toMarkdown} from 'mdast-util-to-markdown'
import {gfmStrikethrough} from 'micromark-extension-gfm-strikethrough'
import {gfmStrikethroughFromMarkdown, gfmStrikethroughToMarkdown} from 'mdast-util-gfm-strikethrough'

const doc = await fs.readFile('example.md')

const tree = fromMarkdown(doc, {
  extensions: [gfmStrikethrough()],
  mdastExtensions: [gfmStrikethroughFromMarkdown]
})

console.log(tree)

const out = toMarkdown(tree, {extensions: [gfmStrikethroughToMarkdown]})

console.log(out)
```

Now, running `node example` yields:

```js
{
  type: 'root',
  children: [
    {
      type: 'paragraph',
      children: [
        {type: 'emphasis', children: [{type: 'text', value: 'Emphasis'}]},
        {type: 'text', value: ', '},
        {type: 'strong', children: [{type: 'text', value: 'importance'}]},
        {type: 'text', value: ', and '},
        {type: 'delete', children: [{type: 'text', value: 'strikethrough'}]},
        {type: 'text', value: '.'}
      ]
    }
  ]
}
```

```markdown
*Emphasis*, **importance**, and ~~strikethrough~~.
```

## API

This package exports the identifiers
[`gfmStrikethroughFromMarkdown`][api-gfm-strikethrough-from-markdown] and
[`gfmStrikethroughToMarkdown`][api-gfm-strikethrough-to-markdown].
There is no default export.

### `gfmStrikethroughFromMarkdown`

Extension for [`mdast-util-from-markdown`][mdast-util-from-markdown] to enable
GFM strikethrough ([`FromMarkdownExtension`][from-markdown-extension]).

### `gfmStrikethroughToMarkdown`

Extension for [`mdast-util-to-markdown`][mdast-util-to-markdown] to enable
GFM strikethrough ([`ToMarkdownExtension`][to-markdown-extension]).

## HTML

This utility does not handle how markdown is turned to HTML.
That’s done by [`mdast-util-to-hast`][mdast-util-to-hast].
If you want a different element, you should configure that utility.

## Syntax

See [Syntax in `micromark-extension-gfm-strikethrough`][syntax].

## Syntax tree

The following interfaces are added to **[mdast][]** by this utility.

### Nodes

#### `Delete`

```idl
interface Delete <: Parent {
  type: 'delete'
  children: [TransparentContent]
}
```

**Delete** (**[Parent][dfn-parent]**) represents contents that are no longer
accurate or no longer relevant.

**Delete** can be used where **[static phrasing][dfn-static-phrasing-content]**
content is expected.
Its content model is **[transparent][dfn-transparent-content]** content.

For example, the following markdown:

```markdown
~~alpha~~
```

Yields:

```js
{
  type: 'delete',
  children: [{type: 'text', value: 'alpha'}]
}
```

### Content model

#### `StaticPhrasingContent` (GFM strikethrough)

```idl
type StaticPhrasingContentGfm = Delete | StaticPhrasingContent
```

## Types

This package is fully typed with [TypeScript][].
It does not export additional types.

The `Delete` type of the mdast node is exposed from `@types/mdast`.

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
*   [`micromark/micromark-extension-gfm-strikethrough`][extension]
    — micromark extension to parse GFM strikethrough

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

[build-badge]: https://github.com/syntax-tree/mdast-util-gfm-strikethrough/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-gfm-strikethrough/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-gfm-strikethrough.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-gfm-strikethrough

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-gfm-strikethrough.svg

[downloads]: https://www.npmjs.com/package/mdast-util-gfm-strikethrough

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-gfm-strikethrough.svg

[size]: https://bundlephobia.com/result?p=mdast-util-gfm-strikethrough

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

[gfm]: https://github.github.com/gfm/

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[mdast]: https://github.com/syntax-tree/mdast

[dfn-transparent-content]: https://github.com/syntax-tree/mdast#transparentcontent

[mdast-util-from-markdown]: https://github.com/syntax-tree/mdast-util-from-markdown

[from-markdown-extension]: https://github.com/syntax-tree/mdast-util-from-markdown#extension

[mdast-util-to-markdown]: https://github.com/syntax-tree/mdast-util-to-markdown

[to-markdown-extension]: https://github.com/syntax-tree/mdast-util-to-markdown#options

[mdast-util-gfm]: https://github.com/syntax-tree/mdast-util-gfm

[mdast-util-to-hast]: https://github.com/syntax-tree/mdast-util-to-hast

[micromark]: https://github.com/micromark/micromark

[extension]: https://github.com/micromark/micromark-extension-gfm-strikethrough

[syntax]: https://github.com/micromark/micromark-extension-gfm-strikethrough#syntax

[dfn-parent]: https://github.com/syntax-tree/mdast#parent

[dfn-static-phrasing-content]: #staticphrasingcontent-gfm-strikethrough

[api-gfm-strikethrough-from-markdown]: #gfmstrikethroughfrommarkdown

[api-gfm-strikethrough-to-markdown]: #gfmstrikethroughtomarkdown
