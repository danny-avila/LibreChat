# hast-util-from-parse5

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[hast][] utility to transform from [`parse5`][parse5]s AST.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`fromParse5(tree[, file|options])`](#fromparse5tree-fileoptions)
    *   [`Options`](#options)
    *   [`Space`](#space-1)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a utility that can turn a parse5 tree into a hast tree.

## When should I use this?

You can use this package when using `parse5` as an HTML parser and wanting to
work with hast.

The utility [`hast-util-to-parse5`][hast-util-to-parse5] does the inverse of
this utility.
It generates `parse5`s AST again.

The utility [`hast-util-from-html`][hast-util-from-html] wraps this utility and
`parse5` to both parse HTML and generate hast from it.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install hast-util-from-parse5
```

In Deno with [`esm.sh`][esmsh]:

```js
import {fromParse5} from "https://esm.sh/hast-util-from-parse5@7"
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {fromParse5} from "https://esm.sh/hast-util-from-parse5@7?bundle"
</script>
```

## Use

Say our document `example.html` contains:

```html
<!doctype html><title>Hello!</title><h1 id="world">World!<!--after-->
```

…and our module `example.js` looks as follows:

```js
import {parse} from 'parse5'
import {read} from 'to-vfile'
import {inspect} from 'unist-util-inspect'
import {fromParse5} from 'hast-util-from-parse5'

const file = await read('example.html')
const p5ast = parse(String(file), {sourceCodeLocationInfo: true})
const hast = fromParse5(p5ast, file)

console.log(inspect(hast))
```

…now running `node example.js` yields:

```text
root[2] (1:1-2:1, 0-70)
│ data: {"quirksMode":false}
├─0 doctype<html> (1:1-1:16, 0-15)
│     public: null
│     system: null
└─1 element<html>[2]
    │ properties: {}
    ├─0 element<head>[1]
    │   │ properties: {}
    │   └─0 element<title>[1] (1:16-1:37, 15-36)
    │       │ properties: {}
    │       └─0 text "Hello!" (1:23-1:29, 22-28)
    └─1 element<body>[1]
        │ properties: {}
        └─0 element<h1>[3] (1:37-2:1, 36-70)
            │ properties: {"id":"world"}
            ├─0 text "World!" (1:52-1:58, 51-57)
            ├─1 comment "after" (1:58-1:70, 57-69)
            └─2 text "\n" (1:70-2:1, 69-70)
```

## API

This package exports the identifier [`fromParse5`][fromparse5].
There is no default export.

### `fromParse5(tree[, file|options])`

Transform a `parse5` AST to hast.

###### Parameters

*   `tree` ([`Parse5Node`][parse5-node])
    — `parse5` tree to transform
*   `file` ([`VFile`][vfile], optional)
    — corresponding file (treated as `{file: file}`)
*   `options` ([`Options`][options], optional)
    — configuration

###### Returns

hast tree ([`HastNode`][hast-node]).

### `Options`

Configuration (TypeScript type).

##### Fields

###### `space`

Which space the document is in ([`Space`][space], default: `'html'`).

When an `<svg>` element is found in the HTML space, this package already
automatically switches to and from the SVG space when entering and exiting
it.

###### `file`

File used to add positional info to nodes ([`VFile`][vfile], optional).

If given, the file should represent the original HTML source.

###### `verbose`

Whether to add extra positional info about starting tags, closing tags,
and attributes to elements (`boolean`, default: `false`).

> 👉 **Note**: only used when `file` is given.

For the following HTML:

```html
<img src="http://example.com/fav.ico" alt="foo" title="bar">
```

The verbose info would looks as follows:

```js
{
  type: 'element',
  tagName: 'img',
  properties: {src: 'http://example.com/fav.ico', alt: 'foo', title: 'bar'},
  children: [],
  data: {
    position: {
      opening: {
        start: {line: 1, column: 1, offset: 0},
        end: {line: 1, column: 61, offset: 60}
      },
      closing: null,
      properties: {
        src: {
          start: {line: 1, column: 6, offset: 5},
          end: {line: 1, column: 38, offset: 37}
        },
        alt: {
          start: {line: 1, column: 39, offset: 38},
          end: {line: 1, column: 48, offset: 47}
        },
        title: {
          start: {line: 1, column: 49, offset: 48},
          end: {line: 1, column: 60, offset: 59}
        }
      }
    }
  },
  position: {
    start: {line: 1, column: 1, offset: 0},
    end: {line: 1, column: 61, offset: 60}
  }
}
```

### `Space`

Namespace (TypeScript type).

###### Type

```ts
type Space = 'html' | 'svg'
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional types [`Options`][options] and [`Space`][space].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, 16.0+, and 18.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

Use of `hast-util-from-parse5` can open you up to a
[cross-site scripting (XSS)][xss] attack if Parse5’s AST is unsafe.

## Related

*   [`hast-util-to-parse5`](https://github.com/syntax-tree/hast-util-to-parse5)
    — transform hast to Parse5’s AST
*   [`hast-util-to-nlcst`](https://github.com/syntax-tree/hast-util-to-nlcst)
    — transform hast to nlcst
*   [`hast-util-to-mdast`](https://github.com/syntax-tree/hast-util-to-mdast)
    — transform hast to mdast
*   [`hast-util-to-xast`](https://github.com/syntax-tree/hast-util-to-xast)
    — transform hast to xast
*   [`mdast-util-to-hast`](https://github.com/syntax-tree/mdast-util-to-hast)
    — transform mdast to hast
*   [`mdast-util-to-nlcst`](https://github.com/syntax-tree/mdast-util-to-nlcst)
    — transform mdast to nlcst

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

[build-badge]: https://github.com/syntax-tree/hast-util-from-parse5/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/hast-util-from-parse5/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/hast-util-from-parse5.svg

[coverage]: https://codecov.io/github/syntax-tree/hast-util-from-parse5

[downloads-badge]: https://img.shields.io/npm/dm/hast-util-from-parse5.svg

[downloads]: https://www.npmjs.com/package/hast-util-from-parse5

[size-badge]: https://img.shields.io/bundlephobia/minzip/hast-util-from-parse5.svg

[size]: https://bundlephobia.com/result?p=hast-util-from-parse5

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

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[parse5]: https://github.com/inikulin/parse5

[parse5-node]: https://github.com/inikulin/parse5/blob/master/packages/parse5/lib/tree-adapters/default.ts

[vfile]: https://github.com/vfile/vfile

[hast-util-to-parse5]: https://github.com/syntax-tree/hast-util-to-parse5

[hast]: https://github.com/syntax-tree/hast

[hast-util-from-html]: https://github.com/syntax-tree/hast-util-from-html

[hast-node]: https://github.com/syntax-tree/hast#nodes

[fromparse5]: #fromparse5tree-fileoptions

[options]: #options

[space]: #space-1
