# mdast-util-gfm-table

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] extensions to parse and serialize [GFM][] tables.

## Contents

*   [What is this?](#what-is-this)
*   [When to use this](#when-to-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`gfmTableFromMarkdown`](#gfmtablefrommarkdown)
    *   [`gfmTableToMarkdown(options?)`](#gfmtabletomarkdownoptions)
    *   [`Options`](#options)
*   [Examples](#examples)
    *   [Example: `stringLength`](#example-stringlength)
*   [HTML](#html)
*   [Syntax](#syntax)
*   [Syntax tree](#syntax-tree)
    *   [Nodes](#nodes)
    *   [Enumeration](#enumeration)
    *   [Content model](#content-model)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package contains two extensions that add support for GFM table syntax in
markdown to [mdast][].
These extensions plug into
[`mdast-util-from-markdown`][mdast-util-from-markdown] (to support parsing
tables in markdown into a syntax tree) and
[`mdast-util-to-markdown`][mdast-util-to-markdown] (to support serializing
tables in syntax trees to markdown).

## When to use this

You can use these extensions when you are working with
`mdast-util-from-markdown` and `mdast-util-to-markdown` already.

When working with `mdast-util-from-markdown`, you must combine this package
with [`micromark-extension-gfm-table`][extension].

When you don’t need a syntax tree, you can use [`micromark`][micromark]
directly with `micromark-extension-gfm-table`.

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
npm install mdast-util-gfm-table
```

In Deno with [`esm.sh`][esmsh]:

```js
import {gfmTableFromMarkdown, gfmTableToMarkdown} from 'https://esm.sh/mdast-util-gfm-table@1'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {gfmTableFromMarkdown, gfmTableToMarkdown} from 'https://esm.sh/mdast-util-gfm-table@1?bundle'
</script>
```

## Use

Say our document `example.md` contains:

```markdown
| a | b | c | d |
| - | :- | -: | :-: |
| e | f |
| g | h | i | j | k |
```

…and our module `example.js` looks as follows:

```js
import fs from 'node:fs/promises'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {toMarkdown} from 'mdast-util-to-markdown'
import {gfmTable} from 'micromark-extension-gfm-table'
import {gfmTableFromMarkdown, gfmTableToMarkdown} from 'mdast-util-gfm-table'

const doc = await fs.readFile('example.md')

const tree = fromMarkdown(doc, {
  extensions: [gfmTable],
  mdastExtensions: [gfmTableFromMarkdown]
})

console.log(tree)

const out = toMarkdown(tree, {extensions: [gfmTableToMarkdown()]})

console.log(out)
```

…now running `node example.js` yields (positional info removed for brevity):

```js
{
  type: 'root',
  children: [
    {
      type: 'table',
      align: [null, 'left', 'right', 'center'],
      children: [
        {
          type: 'tableRow',
          children: [
            {type: 'tableCell', children: [{type: 'text', value: 'a'}]},
            {type: 'tableCell', children: [{type: 'text', value: 'b'}]},
            {type: 'tableCell', children: [{type: 'text', value: 'c'}]},
            {type: 'tableCell', children: [{type: 'text', value: 'd'}]}
          ]
        },
        {
          type: 'tableRow',
          children: [
            {type: 'tableCell', children: [{type: 'text', value: 'e'}]},
            {type: 'tableCell', children: [{type: 'text', value: 'f'}]}
          ]
        },
        {
          type: 'tableRow',
          children: [
            {type: 'tableCell', children: [{type: 'text', value: 'g'}]},
            {type: 'tableCell', children: [{type: 'text', value: 'h'}]},
            {type: 'tableCell', children: [{type: 'text', value: 'i'}]},
            {type: 'tableCell', children: [{type: 'text', value: 'j'}]},
            {type: 'tableCell', children: [{type: 'text', value: 'k'}]}
          ]
        }
      ]
    }
  ]
}
```

```markdown
| a | b  |  c |  d  |   |
| - | :- | -: | :-: | - |
| e | f  |    |     |   |
| g | h  |  i |  j  | k |
```

## API

This package exports the identifiers
[`gfmTableFromMarkdown`][api-gfmtablefrommarkdown] and
[`gfmTableToMarkdown`][api-gfmtabletomarkdown].
There is no default export.

### `gfmTableFromMarkdown`

Extension for [`mdast-util-from-markdown`][mdast-util-from-markdown] to enable
GFM tables ([`FromMarkdownExtension`][frommarkdownextension]).

### `gfmTableToMarkdown(options?)`

Create an extension for [`mdast-util-to-markdown`][mdast-util-to-markdown] to
enable GFM tables in markdown.

###### Parameters

*   `options` ([`Options`][api-options], optional)
    — configuration

###### Returns

Extension for `mdast-util-to-markdown` to enable GFM tables
([`ToMarkdownExtension`][tomarkdownextension]).

### `Options`

Configuration (TypeScript type).

###### Fields

*   `tableCellPadding` (`boolean`, default: `true`)
    — whether to add a space of padding between delimiters and cells
*   `tablePipeAlign` (`boolean`, default: `true`)
    — whether to align the delimiters
*   `stringLength` (`((value: string) => number)`, default: `s => s.length`)
    — function to detect the length of table cell content, used when aligning
    the delimiters between cells

## Examples

### Example: `stringLength`

It’s possible to align tables based on the visual width of cells.
First, let’s show the problem:

```js
import {fromMarkdown} from 'mdast-util-from-markdown'
import {toMarkdown} from 'mdast-util-to-markdown'
import {gfmTable} from 'micromark-extension-gfm-table'
import {gfmTableFromMarkdown, gfmTableToMarkdown} from 'mdast-util-gfm-table'

const doc = `| Alpha | Bravo |
| - | - |
| 中文 | Charlie |
| 👩‍❤️‍👩 | Delta |`

const tree = fromMarkdown(doc, {
  extensions: [gfmTable],
  mdastExtensions: [gfmTableFromMarkdown]
})

console.log(toMarkdown(tree, {extensions: [gfmTableToMarkdown()]}))
```

The above code shows how these utilities can be used to format markdown.
The output is as follows:

```markdown
| Alpha    | Bravo   |
| -------- | ------- |
| 中文       | Charlie |
| 👩‍❤️‍👩 | Delta   |
```

To improve the alignment of these full-width characters and emoji, pass a
`stringLength` function that calculates the visual width of cells.
One such algorithm is [`string-width`][string-width].
It can be used like so:

```diff
@@ -2,6 +2,7 @@ import {fromMarkdown} from 'mdast-util-from-markdown'
 import {toMarkdown} from 'mdast-util-to-markdown'
 import {gfmTable} from 'micromark-extension-gfm-table'
 import {gfmTableFromMarkdown, gfmTableToMarkdown} from 'mdast-util-gfm-table'
+import stringWidth from 'string-width'

 const doc = `| Alpha | Bravo |
 | - | - |
@@ -13,4 +14,8 @@ const tree = fromMarkdown(doc, {
   mdastExtensions: [gfmTableFromMarkdown]
 })

-console.log(toMarkdown(tree, {extensions: [gfmTableToMarkdown()]}))
+console.log(
+  toMarkdown(tree, {
+    extensions: [gfmTableToMarkdown({stringLength: stringWidth})]
+  })
+)
```

The output of our code with these changes is as follows:

```markdown
| Alpha | Bravo   |
| ----- | ------- |
| 中文  | Charlie |
| 👩‍❤️‍👩    | Delta   |
```

## HTML

This utility does not handle how markdown is turned to HTML.
That’s done by [`mdast-util-to-hast`][mdast-util-to-hast].

## Syntax

See [Syntax in `micromark-extension-gfm-table`][syntax].

## Syntax tree

The following interfaces are added to **[mdast][]** by this utility.

### Nodes

#### `Table`

```idl
interface Table <: Parent {
  type: "table"
  align: [alignType]?
  children: [TableContent]
}
```

**Table** (**[Parent][dfn-parent]**) represents two-dimensional data.

**Table** can be used where **[flow][dfn-flow-content]** content is expected.
Its content model is **[table][dfn-table-content]** content.

The *[head][term-head]* of the node represents the labels of the columns.

An `align` field can be present.
If present, it must be a list of **[alignTypes][dfn-enum-align-type]**.
It represents how cells in columns are aligned.

For example, the following markdown:

```markdown
| foo | bar |
| :-- | :-: |
| baz | qux |
```

Yields:

```js
{
  type: 'table',
  align: ['left', 'center'],
  children: [
    {
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [{type: 'text', value: 'foo'}]
        },
        {
          type: 'tableCell',
          children: [{type: 'text', value: 'bar'}]
        }
      ]
    },
    {
      type: 'tableRow',
      children: [
        {
          type: 'tableCell',
          children: [{type: 'text', value: 'baz'}]
        },
        {
          type: 'tableCell',
          children: [{type: 'text', value: 'qux'}]
        }
      ]
    }
  ]
}
```

#### `TableRow`

```idl
interface TableRow <: Parent {
  type: "tableRow"
  children: [RowContent]
}
```

**TableRow** (**[Parent][dfn-parent]**) represents a row of cells in a table.

**TableRow** can be used where **[table][dfn-table-content]** content is
expected.
Its content model is **[row][dfn-row-content]** content.

If the node is a *[head][term-head]*, it represents the labels of the columns
for its parent **[Table][dfn-table]**.

For an example, see **[Table][dfn-table]**.

#### `TableCell`

```idl
interface TableCell <: Parent {
  type: "tableCell"
  children: [PhrasingContent]
}
```

**TableCell** (**[Parent][dfn-parent]**) represents a header cell in a
**[Table][dfn-table]**, if its parent is a *[head][term-head]*, or a data
cell otherwise.

**TableCell** can be used where **[row][dfn-row-content]** content is expected.
Its content model is **[phrasing][dfn-phrasing-content]** content excluding
**[Break][dfn-break]** nodes.

For an example, see **[Table][dfn-table]**.

### Enumeration

#### `alignType`

```idl
enum alignType {
  "left" | "right" | "center" | null
}
```

**alignType** represents how phrasing content is aligned
([\[CSSTEXT\]][css-text]).

*   **`'left'`**: See the [`left`][css-left] value of the `text-align` CSS
    property
*   **`'right'`**: See the [`right`][css-right] value of the `text-align`
    CSS property
*   **`'center'`**: See the [`center`][css-center] value of the `text-align`
    CSS property
*   **`null`**: phrasing content is aligned as defined by the host environment

### Content model

#### `FlowContent` (GFM table)

```idl
type FlowContentGfm = Table | FlowContent
```

#### `TableContent`

```idl
type TableContent = TableRow
```

**Table** content represent the rows in a table.

#### `RowContent`

```idl
type RowContent = TableCell
```

**Row** content represent the cells in a row.

## Types

This package is fully typed with [TypeScript][].
It exports the additional type [`Options`][api-options].

The `Table`, `TableRow`, and `TableCell` types of the mdast nodes are exposed
from `@types/mdast`.

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
*   [`micromark/micromark-extension-gfm-table`][extension]
    — micromark extension to parse GFM tables

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

[build-badge]: https://github.com/syntax-tree/mdast-util-gfm-table/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-gfm-table/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-gfm-table.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-gfm-table

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-gfm-table.svg

[downloads]: https://www.npmjs.com/package/mdast-util-gfm-table

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-gfm-table.svg

[size]: https://bundlephobia.com/result?p=mdast-util-gfm-table

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

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[mdast]: https://github.com/syntax-tree/mdast

[mdast-util-gfm]: https://github.com/syntax-tree/mdast-util-gfm

[mdast-util-from-markdown]: https://github.com/syntax-tree/mdast-util-from-markdown

[mdast-util-to-markdown]: https://github.com/syntax-tree/mdast-util-to-markdown

[mdast-util-to-hast]: https://github.com/syntax-tree/mdast-util-to-hast

[micromark]: https://github.com/micromark/micromark

[extension]: https://github.com/micromark/micromark-extension-gfm-table

[syntax]: https://github.com/micromark/micromark-extension-gfm-table#syntax

[gfm]: https://github.github.com/gfm/

[string-width]: https://github.com/sindresorhus/string-width

[css-text]: https://drafts.csswg.org/css-text/

[css-left]: https://drafts.csswg.org/css-text/#valdef-text-align-left

[css-right]: https://drafts.csswg.org/css-text/#valdef-text-align-right

[css-center]: https://drafts.csswg.org/css-text/#valdef-text-align-center

[term-head]: https://github.com/syntax-tree/unist#head

[dfn-parent]: https://github.com/syntax-tree/mdast#parent

[dfn-phrasing-content]: https://github.com/syntax-tree/mdast#phrasingcontent

[dfn-break]: https://github.com/syntax-tree/mdast#break

[frommarkdownextension]: https://github.com/syntax-tree/mdast-util-from-markdown#extension

[tomarkdownextension]: https://github.com/syntax-tree/mdast-util-to-markdown#options

[api-gfmtablefrommarkdown]: #gfmtablefrommarkdown

[api-gfmtabletomarkdown]: #gfmtabletomarkdownoptions

[api-options]: #options

[dfn-flow-content]: #flowcontent-gfm-table

[dfn-table-content]: #tablecontent

[dfn-enum-align-type]: #aligntype

[dfn-row-content]: #rowcontent

[dfn-table]: #table
