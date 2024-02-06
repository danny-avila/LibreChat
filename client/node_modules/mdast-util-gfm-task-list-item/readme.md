# mdast-util-gfm-task-list-item

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] extensions to parse and serialize [GFM][] task list items.

## Contents

*   [What is this?](#what-is-this)
*   [When to use this](#when-to-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`gfmTaskListItemFromMarkdown`](#gfmtasklistitemfrommarkdown)
    *   [`gfmTaskListItemToMarkdown`](#gfmtasklistitemtomarkdown)
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

This package contains two extensions that add support for GFM task list item
syntax in markdown to [mdast][].
These extensions plug into
[`mdast-util-from-markdown`][mdast-util-from-markdown] (to support parsing
task lists in markdown into a syntax tree) and
[`mdast-util-to-markdown`][mdast-util-to-markdown] (to support serializing
task lists in syntax trees to markdown).

## When to use this

You can use these extensions when you are working with
`mdast-util-from-markdown` and `mdast-util-to-markdown` already.

When working with `mdast-util-from-markdown`, you must combine this package
with
[`micromark-extension-gfm-task-list-item`][extension].

When you don’t need a syntax tree, you can use [`micromark`][micromark]
directly with `micromark-extension-gfm-task-list-item`.

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
npm install mdast-util-gfm-task-list-item
```

In Deno with [`esm.sh`][esmsh]:

```js
import {gfmTaskListItemFromMarkdown, gfmTaskListItemToMarkdown} from 'https://esm.sh/mdast-util-gfm-task-list-item@1'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {gfmTaskListItemFromMarkdown, gfmTaskListItemToMarkdown} from 'https://esm.sh/mdast-util-gfm-task-list-item@1?bundle'
</script>
```

## Use

Say our document `example.md` contains:

```markdown
* [ ] To do
* [x] Done

1. Mixed…
2. [x] …messages
```

…and our module `example.js` looks as follows:

```js
import fs from 'node:fs/promises'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {toMarkdown} from 'mdast-util-to-markdown'
import {gfmTaskListItem} from 'micromark-extension-gfm-task-list-item'
import {gfmTaskListItemFromMarkdown, gfmTaskListItemToMarkdown} from 'mdast-util-gfm-task-list-item'

const doc = await fs.readFile('example.md')

const tree = fromMarkdown(doc, {
  extensions: [gfmTaskListItem],
  mdastExtensions: [gfmTaskListItemFromMarkdown]
})

console.log(tree)

const out = toMarkdown(tree, {extensions: [gfmTaskListItemToMarkdown]})

console.log(out)
```

…now running `node example.js` yields (positional info removed for brevity):

```js
{
 type: 'root',
 children: [
   {
     type: 'list',
     ordered: false,
     start: null,
     spread: false,
     children: [
       {
         type: 'listItem',
         spread: false,
         checked: false,
         children: [
           {type: 'paragraph', children: [{type: 'text', value: 'To do'}]}
         ]
       },
       {
         type: 'listItem',
         spread: false,
         checked: true,
         children: [
           {type: 'paragraph', children: [{type: 'text', value: 'Done'}]}
         ]
       }
     ]
   },
   {
     type: 'list',
     ordered: true,
     start: 1,
     spread: false,
     children: [
       {
         type: 'listItem',
         spread: false,
         checked: null,
         children: [
           {type: 'paragraph', children: [{type: 'text', value: 'Mixed…'}]}
         ]
       },
       {
         type: 'listItem',
         spread: false,
         checked: true,
         children: [
           {type: 'paragraph', children: [{type: 'text', value: '…messages'}]}
         ]
       }
     ]
   }
 ]
}
```

```markdown
*   [ ] To do
*   [x] Done

1.  Mixed…
2.  [x] …messages
```

## API

This package exports the identifiers
[`gfmTaskListItemFromMarkdown`][api-gfmtasklistitemfrommarkdown] and
[`gfmTaskListItemToMarkdown`][api-gfmtasklistitemtomarkdown].
There is no default export.

### `gfmTaskListItemFromMarkdown`

Extension for [`mdast-util-from-markdown`][mdast-util-from-markdown]
to enable GFM task lists ([`FromMarkdownExtension`][frommarkdownextension]).

### `gfmTaskListItemToMarkdown`

Extension for [`mdast-util-to-markdown`][mdast-util-to-markdown]
to enable GFM task lists ([`ToMarkdownExtension`][tomarkdownextension]).

## HTML

This utility does not handle how markdown is turned to HTML.
That’s done by [`mdast-util-to-hast`][mdast-util-to-hast].

## Syntax

See [Syntax in `micromark-extension-gfm-task-list-item`][syntax].

## Syntax tree

The following interfaces are added to **[mdast][]** by this utility.

### Nodes

#### `ListItem` (GFM)

```idl
interface ListItemGfm <: ListItem {
  checked: boolean?
}
```

In GFM, a `checked` field can be present.
It represents whether the item is done (when `true`), not done (when `false`),
or indeterminate or not applicable (when `null` or not present).

### Content model

#### `ListContent` (GFM)

```idl
type ListContentGfm = ListItemGfm
```

## Types

This package is fully typed with [TypeScript][].
It does not export additional types.

The `ListItem` type of the mdast nodes are exposed from `@types/mdast`.

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
*   [`micromark/micromark-extension-gfm-task-list-item`][extension]
    — micromark extension to parse GFM task list items

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

[build-badge]: https://github.com/syntax-tree/mdast-util-gfm-task-list-item/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-gfm-task-list-item/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-gfm-task-list-item.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-gfm-task-list-item

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-gfm-task-list-item.svg

[downloads]: https://www.npmjs.com/package/mdast-util-gfm-task-list-item

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-gfm-task-list-item.svg

[size]: https://bundlephobia.com/result?p=mdast-util-gfm-task-list-item

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

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[mdast-util-from-markdown]: https://github.com/syntax-tree/mdast-util-from-markdown

[mdast-util-to-markdown]: https://github.com/syntax-tree/mdast-util-to-markdown

[mdast-util-gfm]: https://github.com/syntax-tree/mdast-util-gfm

[mdast-util-to-hast]: https://github.com/syntax-tree/mdast-util-to-hast

[micromark]: https://github.com/micromark/micromark

[extension]: https://github.com/micromark/micromark-extension-gfm-task-list-item

[syntax]: https://github.com/micromark/micromark-extension-gfm-task-list-item#syntax

[frommarkdownextension]: https://github.com/syntax-tree/mdast-util-from-markdown#extension

[tomarkdownextension]: https://github.com/syntax-tree/mdast-util-to-markdown#options

[gfm]: https://github.github.com/gfm/

[api-gfmtasklistitemfrommarkdown]: #gfmtasklistitemfrommarkdown

[api-gfmtasklistitemtomarkdown]: #gfmtasklistitemtomarkdown
