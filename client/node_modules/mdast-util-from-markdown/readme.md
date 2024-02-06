# mdast-util-from-markdown

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[mdast][]** utility that turns markdown into a syntax tree.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`fromMarkdown(value[, encoding][, options])`](#frommarkdownvalue-encoding-options)
    *   [`CompileContext`](#compilecontext)
    *   [`CompileData`](#compiledata)
    *   [`Encoding`](#encoding)
    *   [`Extension`](#extension)
    *   [`Handle`](#handle)
    *   [`OnEnterError`](#onentererror)
    *   [`OnExitError`](#onexiterror)
    *   [`Options`](#options)
    *   [`Token`](#token)
    *   [`Transform`](#transform)
    *   [`Value`](#value)
*   [List of extensions](#list-of-extensions)
*   [Syntax](#syntax)
*   [Syntax tree](#syntax-tree)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a utility that takes markdown input and turns it into an
[mdast][] syntax tree.

This utility uses [`micromark`][micromark], which turns markdown into tokens,
and then turns those tokens into nodes.
This package is used inside [`remark-parse`][remark-parse], which focusses on
making it easier to transform content by abstracting these internals away.

## When should I use this?

If you want to handle syntax trees manually, use this.
When you *just* want to turn markdown into HTML, use [`micromark`][micromark]
instead.
For an easier time processing content, use the **[remark][]** ecosystem instead.

You can combine this package with other packages to add syntax extensions to
markdown.
Notable examples that deeply integrate with this package are
[`mdast-util-gfm`][mdast-util-gfm],
[`mdast-util-mdx`][mdast-util-mdx],
[`mdast-util-frontmatter`][mdast-util-frontmatter],
[`mdast-util-math`][mdast-util-math], and
[`mdast-util-directive`][mdast-util-directive].

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install mdast-util-from-markdown
```

In Deno with [`esm.sh`][esmsh]:

```js
import {fromMarkdown} from 'https://esm.sh/mdast-util-from-markdown@1'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {fromMarkdown} from 'https://esm.sh/mdast-util-from-markdown@1?bundle'
</script>
```

## Use

Say we have the following markdown file `example.md`:

```markdown
## Hello, *World*!
```

…and our module `example.js` looks as follows:

```js
import fs from 'node:fs/promises'
import {fromMarkdown} from 'mdast-util-from-markdown'

const doc = await fs.readFile('example.md')
const tree = fromMarkdown(doc)

console.log(tree)
```

…now running `node example.js` yields (positional info removed for brevity):

```js
{
  type: 'root',
  children: [
    {
      type: 'heading',
      depth: 2,
      children: [
        {type: 'text', value: 'Hello, '},
        {type: 'emphasis', children: [{type: 'text', value: 'World'}]},
        {type: 'text', value: '!'}
      ]
    }
  ]
}
```

## API

This package exports the identifier [`fromMarkdown`][api-frommarkdown].
There is no default export.

The export map supports the [`development` condition][development].
Run `node --conditions development example.js` to get instrumented dev code.
Without this condition, production code is loaded.

### `fromMarkdown(value[, encoding][, options])`

Turn markdown into a syntax tree.

###### Overloads

*   `(value: Value, encoding: Encoding, options?: Options) => Root`
*   `(value: Value, options?: Options) => Root`

###### Parameters

*   `value` ([`Value`][api-value])
    — markdown to parse
*   `encoding` ([`Encoding`][api-encoding], default: `'utf8'`)
    — [character encoding][character-encoding] for when `value` is
    [`Buffer`][buffer]
*   `options` ([`Options`][api-options], optional)
    — configuration

###### Returns

mdast tree ([`Root`][root]).

### `CompileContext`

mdast compiler context (TypeScript type).

###### Fields

*   `stack` ([`Array<Node>`][node])
    — stack of nodes
*   `tokenStack` (`Array<[Token, OnEnterError | undefined]>`)
    — stack of tokens
*   `getData` (`(key: string) => unknown`)
    — get data from the key/value store (see [`CompileData`][api-compiledata])
*   `setData` (`(key: string, value?: unknown) => void`)
    — set data into the key/value store (see [`CompileData`][api-compiledata])
*   `buffer` (`() => void`)
    — capture some of the output data
*   `resume` (`() => string`)
    — stop capturing and access the output data
*   `enter` (`(node: Node, token: Token, onError?: OnEnterError) => Node`)
    — enter a token
*   `exit` (`(token: Token, onError?: OnExitError) => Node`)
    — exit a token
*   `sliceSerialize` (`(token: Token, expandTabs?: boolean) => string`)
    — get the string value of a token
*   `config` (`Required<Extension>`)
    — configuration

### `CompileData`

Interface of tracked data (TypeScript type).

###### Type

```ts
interface CompileData { /* see code */ }
```

When working on extensions that use more data, extend the corresponding
interface to register their types:

```ts
declare module 'mdast-util-from-markdown' {
  interface CompileData {
    // Register a new field.
    mathFlowInside?: boolean | undefined
  }
}
```

### `Encoding`

Encodings supported by the [`Buffer`][buffer] class (TypeScript type).

<!-- To do: link to micromark type, when documented. -->

See [`micromark`](https://github.com/micromark/micromark#api) for more info.

###### Type

```ts
type Encoding = 'utf8' | /* … */
```

### `Extension`

Change how markdown tokens from micromark are turned into mdast (TypeScript
type).

###### Properties

*   `canContainEols` (`Array<string>`, optional)
    — token types where line endings are used
*   `enter` ([`Record<string, Handle>`][api-handle], optional)
    — opening handles
*   `exit` ([`Record<string, Handle>`][api-handle], optional)
    — closing handles
*   `transforms` ([`Array<Transform>`][api-transform], optional)
    — tree transforms

### `Handle`

Handle a token (TypeScript type).

###### Parameters

*   `this` ([`CompileContext`][api-compilecontext])
    — context
*   `token` ([`Token`][api-token])
    — current token

###### Returns

Nothing (`void`).

### `OnEnterError`

Handle the case where the `right` token is open, but it is closed (by the
`left` token) or because we reached the end of the document (TypeScript type).

###### Parameters

*   `this` ([`CompileContext`][api-compilecontext])
    — context
*   `left` ([`Token`][api-token] or `undefined`)
    — left token
*   `right` ([`Token`][api-token])
    — right token

###### Returns

Nothing (`void`).

### `OnExitError`

Handle the case where the `right` token is open but it is closed by
exiting the `left` token (TypeScript type).

###### Parameters

*   `this` ([`CompileContext`][api-compilecontext])
    — context
*   `left` ([`Token`][api-token])
    — left token
*   `right` ([`Token`][api-token])
    — right token

###### Returns

Nothing (`void`).

### `Options`

Configuration (TypeScript type).

###### Properties

*   `extensions` ([`Array<MicromarkExtension>`][micromark-extension], optional)
    — micromark extensions to change how markdown is parsed
*   `mdastExtensions` ([`Array<Extension | Array<Extension>>`][api-extension],
    optional)
    — extensions for this utility to change how tokens are turned into a tree

### `Token`

Token from micromark (TypeScript type).

<!-- To do: link to micromark type, when documented. -->

See [`micromark`](https://github.com/micromark/micromark#api) for more info.

###### Type

```ts
type Token = { /* … */ }
```

### `Transform`

Extra transform, to change the AST afterwards (TypeScript type).

###### Parameters

*   `tree` ([`Root`][root])
    — tree to transform

###### Returns

New tree ([`Root`][root]) or nothing (in which case the current tree is used).

### `Value`

Contents of the file (TypeScript type).

<!-- To do: link to micromark type, when documented. -->

See [`micromark`](https://github.com/micromark/micromark#api) for more info.

###### Type

```ts
type Value = string | Uint8Array
```

## List of extensions

*   [`syntax-tree/mdast-util-directive`](https://github.com/syntax-tree/mdast-util-directive)
    — directives
*   [`syntax-tree/mdast-util-frontmatter`](https://github.com/syntax-tree/mdast-util-frontmatter)
    — frontmatter (YAML, TOML, more)
*   [`syntax-tree/mdast-util-gfm`](https://github.com/syntax-tree/mdast-util-gfm)
    — GFM
*   [`syntax-tree/mdast-util-gfm-autolink-literal`](https://github.com/syntax-tree/mdast-util-gfm-autolink-literal)
    — GFM autolink literals
*   [`syntax-tree/mdast-util-gfm-footnote`](https://github.com/syntax-tree/mdast-util-gfm-footnote)
    — GFM footnotes
*   [`syntax-tree/mdast-util-gfm-strikethrough`](https://github.com/syntax-tree/mdast-util-gfm-strikethrough)
    — GFM strikethrough
*   [`syntax-tree/mdast-util-gfm-table`](https://github.com/syntax-tree/mdast-util-gfm-table)
    — GFM tables
*   [`syntax-tree/mdast-util-gfm-task-list-item`](https://github.com/syntax-tree/mdast-util-gfm-task-list-item)
    — GFM task list items
*   [`syntax-tree/mdast-util-math`](https://github.com/syntax-tree/mdast-util-math)
    — math
*   [`syntax-tree/mdast-util-mdx`](https://github.com/syntax-tree/mdast-util-mdx)
    — MDX
*   [`syntax-tree/mdast-util-mdx-expression`](https://github.com/syntax-tree/mdast-util-mdx-expression)
    — MDX expressions
*   [`syntax-tree/mdast-util-mdx-jsx`](https://github.com/syntax-tree/mdast-util-mdx-jsx)
    — MDX JSX
*   [`syntax-tree/mdast-util-mdxjs-esm`](https://github.com/syntax-tree/mdast-util-mdxjs-esm)
    — MDX ESM

## Syntax

Markdown is parsed according to CommonMark.
Extensions can add support for other syntax.
If you’re interested in extending markdown,
[more information is available in micromark’s readme][micromark-extend].

## Syntax tree

The syntax tree is [mdast][].

## Types

This package is fully typed with [TypeScript][].
It exports the additional types [`CompileContext`][api-compilecontext],
[`CompileData`][api-compiledata],
[`Encoding`][api-encoding],
[`Extension`][api-extension],
[`Handle`][api-handle],
[`OnEnterError`][api-onentererror],
[`OnExitError`][api-onexiterror],
[`Options`][api-options],
[`Token`][api-token],
[`Transform`][api-transform], and
[`Value`][api-value].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

As markdown is sometimes used for HTML, and improper use of HTML can open you up
to a [cross-site scripting (XSS)][xss] attack, use of `mdast-util-from-markdown`
can also be unsafe.
When going to HTML, use this utility in combination with
[`hast-util-sanitize`][hast-util-sanitize] to make the tree safe.

## Related

*   [`syntax-tree/mdast-util-to-markdown`](https://github.com/syntax-tree/mdast-util-to-markdown)
    — serialize mdast as markdown
*   [`micromark/micromark`](https://github.com/micromark/micromark)
    — parse markdown
*   [`remarkjs/remark`](https://github.com/remarkjs/remark)
    — process markdown

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

[build-badge]: https://github.com/syntax-tree/mdast-util-from-markdown/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/mdast-util-from-markdown/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/mdast-util-from-markdown.svg

[coverage]: https://codecov.io/github/syntax-tree/mdast-util-from-markdown

[downloads-badge]: https://img.shields.io/npm/dm/mdast-util-from-markdown.svg

[downloads]: https://www.npmjs.com/package/mdast-util-from-markdown

[size-badge]: https://img.shields.io/bundlephobia/minzip/mdast-util-from-markdown.svg

[size]: https://bundlephobia.com/result?p=mdast-util-from-markdown

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/syntax-tree/unist/discussions

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[license]: license

[author]: https://wooorm.com

[health]: https://github.com/syntax-tree/.github

[contributing]: https://github.com/syntax-tree/.github/blob/main/contributing.md

[support]: https://github.com/syntax-tree/.github/blob/main/support.md

[coc]: https://github.com/syntax-tree/.github/blob/main/code-of-conduct.md

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[typescript]: https://www.typescriptlang.org

[mdast]: https://github.com/syntax-tree/mdast

[node]: https://github.com/syntax-tree/mdast#nodes

[mdast-util-gfm]: https://github.com/syntax-tree/mdast-util-gfm

[mdast-util-mdx]: https://github.com/syntax-tree/mdast-util-mdx

[mdast-util-frontmatter]: https://github.com/syntax-tree/mdast-util-frontmatter

[mdast-util-math]: https://github.com/syntax-tree/mdast-util-math

[mdast-util-directive]: https://github.com/syntax-tree/mdast-util-directive

[root]: https://github.com/syntax-tree/mdast#root

[character-encoding]: https://nodejs.org/api/buffer.html#buffer_buffers_and_character_encodings

[buffer]: https://nodejs.org/api/buffer.html

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[hast-util-sanitize]: https://github.com/syntax-tree/hast-util-sanitize

[micromark]: https://github.com/micromark/micromark

[micromark-extension]: https://github.com/micromark/micromark#optionsextensions

[micromark-extend]: https://github.com/micromark/micromark#extensions

[remark]: https://github.com/remarkjs/remark

[remark-parse]: https://github.com/remarkjs/remark/tree/main/packages/remark-parse

[development]: https://nodejs.org/api/packages.html#packages_resolving_user_conditions

[api-frommarkdown]: #frommarkdownvalue-encoding-options

[api-compilecontext]: #compilecontext

[api-compiledata]: #compiledata

[api-encoding]: #encoding

[api-extension]: #extension

[api-handle]: #handle

[api-onentererror]: #onentererror

[api-onexiterror]: #onexiterror

[api-options]: #options

[api-token]: #token

[api-transform]: #transform

[api-value]: #value
