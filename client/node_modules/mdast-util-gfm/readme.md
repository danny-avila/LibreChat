# mdast-util-gfm

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[mdast][] extensions to parse and serialize [GFM][] (autolink literals,
footnotes, strikethrough, tables, tasklists).

## Contents

*   [What is this?](#what-is-this)
*   [When to use this](#when-to-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`gfmFromMarkdown()`](#gfmfrommarkdown)
    *   [`gfmToMarkdown(options?)`](#gfmtomarkdownoptions)
    *   [`Options`](#options)
*   [HTML](#html)
*   [Syntax](#syntax)
*   [Syntax tree](#syntax-tree)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package contains two extensions that add support for GFM syntax in
markdown to [mdast][]: : autolink literals (`www.x.com`), footnotes (`[^1]`),
strikethrough (`~~stuff~~`), tables (`| cell |…`), and tasklists (`* [x]`).
These extensions plug into
[`mdast-util-from-markdown`][mdast-util-from-markdown] (to support parsing
GFM in markdown into a syntax tree) and
[`mdast-util-to-markdown`][mdast-util-to-markdown] (to support serializing
GFM in syntax trees to markdown).

## When to use this

This project is useful when you want to support the same features that GitHub
does in files in a repo, Gists, and several other places.
Users frequently believe that some of these extensions, specifically autolink
literals and tables, are part of normal markdown, so using `mdast-util-gfm` will
help match your implementation to their understanding of markdown.
There are several edge cases where GitHub’s implementation works in unexpected
ways or even different than described in their spec, so *writing* in GFM is not
always the best choice.

You can use these extensions when you are working with
`mdast-util-from-markdown` and `mdast-util-to-markdown` already.

When working with `mdast-util-from-markdown`, you must combine this package
with [`micromark-extension-gfm`][extension].

Instead of this package, you can also use the extensions separately:

*   [`mdast-util-gfm-autolink-literal`](https://github.com/syntax-tree/mdast-util-gfm-autolink-literal)
    — support GFM autolink literals
*   [`mdast-util-gfm-footnote`](https://github.com/syntax-tree/mdast-util-gfm-footnote)
    — support GFM footnotes
*   [`mdast-util-gfm-strikethrough`](https://github.com/syntax-tree/mdast-util-gfm-strikethrough)
    — support GFM strikethrough
*   [`mdast-util-gfm-table`](https://github.com/syntax-tree/mdast-util-gfm-table)
    — support GFM tables
*   [`mdast-util-gfm-task-list-item`](https://github.com/syntax-tree/mdast-util-gfm-task-list-item)
    — support GFM tasklists

A different utility, [`mdast-util-frontmatter`][mdast-util-frontmatter], adds
support for frontmatter.
GitHub supports YAML frontmatter for files in repos and Gists but they don’t
treat it as part of GFM.

All these packages are used in [`remark-gfm`][remark-gfm], which
focusses on making it easier to transform content by abstracting these
internals away.

This utility does not handle how markdown is turned to HTML.
That’s done by [`mdast-util-to-hast`][mdast-util-to-hast].
If your content is not in English, you should configure that utility.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install mdast-util-gfm
```

In Deno with [`esm.sh`][esmsh]:

```js
import {gfmFromMarkdown, gfmToMarkdown} from 'https://esm.sh/mdast-util-gfm@2'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {gfmFromMarkdown, gfmToMarkdown} from 'https://esm.sh/mdast-util-gfm@2?bundle'
</script>
```

## Use

Say our document `example.md` contains:

```markdown
# GFM

## Autolink literals

www.example.com, https://example.com, and contact@example.com.

## Footnote

A note[^1]

[^1]: Big note.

## Strikethrough

~one~ or ~~two~~ tildes.

## Table

| a | b  |  c |  d  |
| - | :- | -: | :-: |

## Tasklist

* [ ] to do
* [x] done
```

…and our module `example.js` looks as follows:

```js
import fs from 'node:fs/promises'
import {fromMarkdown} from 'mdast-util-from-markdown'
import {toMarkdown} from 'mdast-util-to-markdown'
import {gfm} from 'micromark-extension-gfm'
import {gfmFromMarkdown, gfmToMarkdown} from 'mdast-util-gfm'

const doc = await fs.readFile('example.md')

const tree = fromMarkdown(doc, {
  extensions: [gfm()],
  mdastExtensions: [gfmFromMarkdown()]
})

console.log(tree)

const out = toMarkdown(tree, {extensions: [gfmToMarkdown()]})

console.log(out)
```

…now running `node example.js` yields (positional info removed for brevity):

```js
{
  type: 'root',
  children: [
    {type: 'heading', depth: 1, children: [{type: 'text', value: 'GFM'}]},
    {
      type: 'heading',
      depth: 2,
      children: [{type: 'text', value: 'Autolink literals'}]
    },
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
    },
    {type: 'heading', depth: 2, children: [{type: 'text', value: 'Footnote'}]},
    {
      type: 'paragraph',
      children: [
        {type: 'text', value: 'A note'},
        {type: 'footnoteReference', identifier: '1', label: '1'}
      ]
    },
    {
      type: 'footnoteDefinition',
      identifier: '1',
      label: '1',
      children: [
        {type: 'paragraph', children: [{type: 'text', value: 'Big note.'}]}
      ]
    },
    {
      type: 'heading',
      depth: 2,
      children: [{type: 'text', value: 'Strikethrough'}]
    },
    {
      type: 'paragraph',
      children: [
        {
          type: 'delete',
          children: [{type: 'text', value: 'one'}]
        },
        {type: 'text', value: ' or '},
        {
          type: 'delete',
          children: [{type: 'text', value: 'two'}]
        },
        {type: 'text', value: ' tildes.'}
      ]
    },
    {type: 'heading', depth: 2, children: [{type: 'text', value: 'Table'}]},
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
        }
      ]
    },
    {type: 'heading', depth: 2, children: [{type: 'text', value: 'Tasklist'}]},
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
            {type: 'paragraph', children: [{type: 'text', value: 'to do'}]}
          ]
        },
        {
          type: 'listItem',
          spread: false,
          checked: true,
          children: [
            {type: 'paragraph', children: [{type: 'text', value: 'done'}]}
          ]
        }
      ]
    }
  ]
}
```

```markdown
# GFM

## Autolink literals

[www.example.com](http://www.example.com), <https://example.com>, and <contact@example.com>.

## Footnote

A note[^1]

[^1]: Big note.

## Strikethrough

~~one~~ or ~~two~~ tildes.

## Table

| a | b  |  c |  d  |
| - | :- | -: | :-: |

## Tasklist

*   [ ] to do
*   [x] done
```

## API

This package exports the identifiers [`gfmFromMarkdown`][api-gfm-from-markdown]
and [`gfmToMarkdown`][api-gfm-to-markdown].
There is no default export.

### `gfmFromMarkdown()`

Create an extension for [`mdast-util-from-markdown`][mdast-util-from-markdown]
to enable GFM (autolink literals, footnotes, strikethrough, tables, tasklists).

###### Returns

Extension for `mdast-util-from-markdown` to enable GFM
([`Array<FromMarkdownExtension>`][from-markdown-extension]).

### `gfmToMarkdown(options?)`

Create an extension for [`mdast-util-to-markdown`][mdast-util-to-markdown]
to enable GFM (autolink literals, footnotes, strikethrough, tables, tasklists).

###### Parameters

*   `options` ([`Options`][api-options])
    — configuration

###### Returns

Extension for `mdast-util-to-markdown` to enable GFM
([`Array<ToMarkdownExtension>`][to-markdown-extension]).

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

## HTML

This utility does not handle how markdown is turned to HTML.
That’s done by [`mdast-util-to-hast`][mdast-util-to-hast].

## Syntax

See [Syntax in `micromark-extension-gfm`][syntax].

## Syntax tree

This utility combines several mdast utilities.
See their readmes for the node types supported in the tree:

*   [`mdast-util-gfm-autolink-literal`](https://github.com/syntax-tree/mdast-util-gfm-autolink-literal#syntax-tree)
    — GFM autolink literals
*   [`mdast-util-gfm-footnote`](https://github.com/syntax-tree/mdast-util-gfm-footnote#syntax-tree)
    — GFM footnotes
*   [`mdast-util-gfm-strikethrough`](https://github.com/syntax-tree/mdast-util-gfm-strikethrough#syntax-tree)
    — GFM strikethrough
*   [`mdast-util-gfm-table`](https://github.com/syntax-tree/mdast-util-gfm-table#syntax-tree)
    — GFM tables
*   [`mdast-util-gfm-task-list-item`](https://github.com/syntax-tree/mdast-util-gfm-task-list-item#syntax-tree)
    — GFM tasklists

## Types

This package is fully typed with [TypeScript][].
It exports the additional type [`Options`][api-options].

The `Delete`, `FootnoteDefinition`, `FootnoteReference`, `Table`, `TableRow`,
and `TableCell` types of the mdast nodes are exposed from `@types/mdast`.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

This plugin works with `mdast-util-from-markdown` version 1+ and
`mdast-util-to-markdown` version 1+.

## Related

*   [`remark-gfm`][remark-gfm]
    — remark plugin to support GFM
*   [`micromark-extension-gfm`][extension]
    — micromark extension to parse GFM

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

[build-badge]: https://github.com/syntax-tree/mdast-util-gfm/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-gfm/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-gfm.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-gfm

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-gfm.svg

[downloads]: https://www.npmjs.com/package/mdast-util-gfm

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-gfm.svg

[size]: https://bundlephobia.com/result?p=mdast-util-gfm

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

[mdast]: https://github.com/syntax-tree/mdast

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[mdast-util-from-markdown]: https://github.com/syntax-tree/mdast-util-from-markdown

[from-markdown-extension]: https://github.com/syntax-tree/mdast-util-from-markdown#extension

[mdast-util-to-markdown]: https://github.com/syntax-tree/mdast-util-to-markdown

[to-markdown-extension]: https://github.com/syntax-tree/mdast-util-to-markdown#options

[mdast-util-frontmatter]: https://github.com/syntax-tree/mdast-util-frontmatter

[mdast-util-to-hast]: https://github.com/syntax-tree/mdast-util-to-hast

[extension]: https://github.com/micromark/micromark-extension-gfm

[syntax]: https://github.com/micromark/micromark-extension-gfm#syntax

[gfm]: https://github.github.com/gfm/

[api-gfm-from-markdown]: #gfmfrommarkdown

[api-gfm-to-markdown]: #gfmtomarkdownoptions

[api-options]: #options
