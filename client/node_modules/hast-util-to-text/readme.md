# hast-util-to-text

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[hast][] utility to get the plain-text value of a node.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`toText(tree[, options])`](#totexttree-options)
    *   [`Options`](#options)
    *   [`Whitespace`](#whitespace)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a utility that takes a [hast][] node and gets its plain-text
value.
It is like the DOMs `Node#innerText`, which is a bit nicer than
`Node#textContent`, because this turns `<br>` elements into line breaks and
uses `'\t'` (tabs) between table cells.

There are some small deviations from the spec, because the DOM has knowledge of
associated CSS, and can take into account that elements have `display: none` or
`text-transform` association with them, and this utility can’t do that.

## When should I use this?

This is a small utility that is useful when you want a plain-text version of a
node that is close to how it’s “visible” to users.

This utility is similar to [`hast-util-to-string`][hast-util-to-string], which
is simpler, and more like the `Node#textContent` algorithm discussed above.

There is also a package [`hast-util-from-text`][hast-util-from-text], which sort
of does the inverse: it takes a string, sets that as text on the node, while
turning line endings into `<br>`s

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ or 16.0+), install with [npm][]:

```sh
npm install hast-util-to-text
```

In Deno with [`esm.sh`][esmsh]:

```js
import {toText} from "https://esm.sh/hast-util-to-text@3"
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {toText} from "https://esm.sh/hast-util-to-text@3?bundle"
</script>
```

## Use

```js
import {h} from 'hastscript'
import {toText} from 'hast-util-to-text'

const tree = h('div', [
  h('h1', {hidden: true}, 'Alpha.'),
  h('article', [
    h('p', ['Bravo', h('br'), 'charlie.']),
    h('p', 'Delta echo \t foxtrot.')
  ])
])

console.log(toText(tree))
```

Yields:

```txt
Bravo
charlie.

Delta echo foxtrot.
```

## API

This package exports the identifier [`toText`][totext].
There is no default export.

### `toText(tree[, options])`

Get the plain-text value of a node.

###### Parameters

*   `tree` ([`Node`][node])
    — tree to turn into text
*   `options` ([`Options`][options], optional)
    — configuration

###### Returns

Serialized `tree` (`string`).

###### Algorithm

*   if `tree` is a [comment][], returns its `value`
*   if `tree` is a [text][], applies normal whitespace collapsing to its
    `value`, as defined by the [CSS Text][css] spec
*   if `tree` is a [root][] or [element][], applies an algorithm similar to the
    `innerText` getter as defined by [HTML][]

###### Notes

> 👉 **Note**: the algorithm acts as if `tree` is being rendered, and as if
> we’re a CSS-supporting user agent, with scripting enabled.

*   if `tree` is an element that is not displayed (such as a `head`), we’ll
    still use the `innerText` algorithm instead of switching to `textContent`
*   if descendants of `tree` are elements that are not displayed, they are
    ignored
*   CSS is not considered, except for the default user agent style sheet
*   a line feed is collapsed instead of ignored in cases where Fullwidth, Wide,
    or Halfwidth East Asian Width characters are used, the same goes for a case
    with Chinese, Japanese, or Yi writing systems
*   replaced elements (such as `audio`) are treated like non-replaced elements

### `Options`

Configuration (TypeScript type).

##### Fields

*   `whitespace` ([`Whitespace`][whitespace], default: `'normal'`)
    — default whitespace setting to use

### `Whitespace`

Valid and useful whitespace values (from [CSS][]) (TypeScript type).

##### Type

```ts
type Whitespace = 'normal' | 'pre' | 'nowrap' | 'pre-wrap'
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional types [`Options`][options] and
[`Whitespace`][whitespace].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

`hast-util-to-text` does not change the syntax tree so there are no
openings for [cross-site scripting (XSS)][xss] attacks.

## Related

*   [`hast-util-to-string`](https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-to-string)
    — get the plain-text value (`textContent`)
*   [`hast-util-from-text`](https://github.com/syntax-tree/hast-util-from-text)
    — set the plain-text value (`innerText`)
*   [`hast-util-from-string`](https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-from-string)
    — set the plain-text value (`textContent`)

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

[build-badge]: https://github.com/syntax-tree/hast-util-to-text/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/hast-util-to-text/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/hast-util-to-text.svg

[coverage]: https://codecov.io/github/syntax-tree/hast-util-to-text

[downloads-badge]: https://img.shields.io/npm/dm/hast-util-to-text.svg

[downloads]: https://www.npmjs.com/package/hast-util-to-text

[size-badge]: https://img.shields.io/bundlephobia/minzip/hast-util-to-text.svg

[size]: https://bundlephobia.com/result?p=hast-util-to-text

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

[html]: https://html.spec.whatwg.org/multipage/dom.html#the-innertext-idl-attribute

[css]: https://drafts.csswg.org/css-text/#white-space-phase-1

[hast-util-to-string]: https://github.com/rehypejs/rehype-minify/tree/main/packages/hast-util-to-string

[hast-util-from-text]: https://github.com/syntax-tree/hast-util-from-text

[hast]: https://github.com/syntax-tree/hast

[node]: https://github.com/syntax-tree/hast#nodes

[root]: https://github.com/syntax-tree/hast#root

[comment]: https://github.com/syntax-tree/hast#comment

[text]: https://github.com/syntax-tree/hast#text

[element]: https://github.com/syntax-tree/hast#element

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[totext]: #totexttree-options

[options]: #options

[whitespace]: #whitespace
