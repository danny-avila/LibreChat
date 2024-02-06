# hastscript

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[hast][] utility to create trees with ease.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`h(selector?[, properties][, …children])`](#hselector-properties-children)
    *   [`s(selector?[, properties][, …children])`](#sselector-properties-children)
    *   [`Child`](#child)
    *   [`Properties`](#properties-1)
    *   [`Result`](#result)
*   [Syntax tree](#syntax-tree)
*   [JSX](#jsx)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a hyperscript interface (like `createElement` from React and
`h` from Vue and such) to help with creating hast trees.

## When should I use this?

You can use this utility in your project when you generate hast syntax trees
with code.
It helps because it replaces most of the repetition otherwise needed in a syntax
tree with function calls.
It also helps as it improves the attributes you pass by turning them into the
form that is required by hast.

You can instead use [`unist-builder`][u] when creating any unist nodes and
[`xastscript`][x] when creating xast (XML) nodes.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ or 16.0+), install with [npm][]:

```sh
npm install hastscript
```

In Deno with [`esm.sh`][esmsh]:

```js
import {h} from 'https://esm.sh/hastscript@7'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {h} from 'https://esm.sh/hastscript@7?bundle'
</script>
```

## Use

```js
import {h, s} from 'hastscript'

console.log(
  h('.foo#some-id', [
    h('span', 'some text'),
    h('input', {type: 'text', value: 'foo'}),
    h('a.alpha', {class: 'bravo charlie', download: 'download'}, [
      'delta',
      'echo'
    ])
  ])
)

console.log(
  s('svg', {xmlns: 'http://www.w3.org/2000/svg', viewbox: '0 0 500 500'}, [
    s('title', 'SVG `<circle>` element'),
    s('circle', {cx: 120, cy: 120, r: 100})
  ])
)
```

Yields:

```js
{
  type: 'element',
  tagName: 'div',
  properties: {className: ['foo'], id: 'some-id'},
  children: [
    {
      type: 'element',
      tagName: 'span',
      properties: {},
      children: [{type: 'text', value: 'some text'}]
    },
    {
      type: 'element',
      tagName: 'input',
      properties: {type: 'text', value: 'foo'},
      children: []
    },
    {
      type: 'element',
      tagName: 'a',
      properties: {className: ['alpha', 'bravo', 'charlie'], download: true},
      children: [{type: 'text', value: 'delta'}, {type: 'text', value: 'echo'}]
    }
  ]
}
{
  type: 'element',
  tagName: 'svg',
  properties: {xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 500 500'},
  children: [
    {
      type: 'element',
      tagName: 'title',
      properties: {},
      children: [{type: 'text', value: 'SVG `<circle>` element'}]
    },
    {
      type: 'element',
      tagName: 'circle',
      properties: {cx: 120, cy: 120, r: 100},
      children: []
    }
  ]
}
```

## API

This package exports the identifiers `h` and `s`.
There is no default export.

The export map supports the automatic JSX runtime.
You can pass `hastscript` (or `hastscript/html`) or `hastscript/svg` to your
build tool (TypeScript, Babel, SWC) with an `importSource` option or similar.

### `h(selector?[, properties][, …children])`

Create virtual **[hast][]** trees for HTML.

##### Signatures

*   `h(): root`
*   `h(null[, …children]): root`
*   `h(selector[, properties][, …children]): element`

##### Parameters

###### `selector`

Simple CSS selector (`string`, optional).
Can contain a tag name (`foo`), IDs (`#bar`), and classes (`.baz`).
If the selector is a string but there is no tag name in it, `h` defaults to
build a `div` element, and `s` to a `g` element.
`selector` is parsed by [`hast-util-parse-selector`][parse-selector].
When string, builds an [`Element`][element].
When nullish, builds a [`Root`][root] instead.

###### `properties`

Properties of the element ([`Properties`][properties], optional).

###### `children`

Children of the element ([`Child`][child] or `Array<Child>`, optional).

##### Returns

Created tree ([`Result`][result]).
[`Element`][element] when a `selector` is passed, otherwise [`Root`][root].

### `s(selector?[, properties][, …children])`

Create virtual **[hast][]** trees for SVG.

Signatures, parameters, and return value are the same as `h` above.
Importantly, the `selector` and `properties` parameters are interpreted as
SVG.

### `Child`

(Lists of) children (TypeScript type).
When strings or numbers are encountered, they are turned into [`Text`][text]
nodes.
[`Root`][root] nodes are treated as “fragments”, meaning that their children
are used instead.

###### Type

```ts
type Child =
  | string
  | number
  | null
  | undefined
  | Node
  | Array<string | number | null | undefined | Node>
```

### `Properties`

Map of properties (TypeScript type).
Keys should match either the HTML attribute name, or the DOM property name, but
are case-insensitive.

###### Type

```ts
type Properties = Record<
  string,
  | string
  | number
  | boolean
  | null
  | undefined
  // For comma- and space-separated values such as `className`:
  | Array<string | number>
  // Accepts value for `style` prop as object.
  | Record<string, string | number>
>
```

### `Result`

Result from a `h` (or `s`) call (TypeScript type).

###### Type

```ts
type Result = Root | Element
```

## Syntax tree

The syntax tree is [hast][].

## JSX

This package can be used with JSX.
You should use the automatic JSX runtime set to `hastscript` (also available as
the more explicit name `hastscript/html`) or `hastscript/svg`.

> 👉 **Note**: while `h` supports dots (`.`) for classes or number signs (`#`)
> for IDs in `selector`, those are not supported in JSX.

> 🪦 **Legacy**: you can also use the classic JSX runtime, but this is not
> recommended.
> To do so, import `h` (or `s`) yourself and define it as the pragma (plus
> set the fragment to `null`).

The Use example above can then be written like so, using inline pragmas, so
that SVG can be used too:

`example-html.jsx`:

```jsx
/** @jsxImportSource hastscript */
console.log(
  <div class="foo" id="some-id">
    <span>some text</span>
    <input type="text" value="foo" />
    <a class="alpha bravo charlie" download>
      deltaecho
    </a>
  </div>
)
```

`example-svg.jsx`:

```jsx
/** @jsxImportSource hastscript/svg */
console.log(
  <svg xmlns="http://www.w3.org/2000/svg" viewbox="0 0 500 500">
    <title>SVG `&lt;circle&gt;` element</title>
    <circle cx={120} cy={120} r={100} />
  </svg>
)
```

## Types

This package is fully typed with [TypeScript][].
It exports the additional types `Child`, `Properties`, and `Result`.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

Use of `hastscript` can open you up to a [cross-site scripting (XSS)][xss]
when you pass user-provided input to it because values are injected into the
syntax tree.

The following example shows how an image is injected that fails loading and
therefore runs code in a browser.

```js
const tree = h()

// Somehow someone injected these properties instead of an expected `src` and
// `alt`:
const otherProps = {src: 'x', onError: 'alert(2)'}

tree.children.push(h('img', {src: 'default.png', ...otherProps}))
```

Yields:

```html
<img src="x" onerror="alert(2)">
```

The following example shows how code can run in a browser because someone stored
an object in a database instead of the expected string.

```js
const tree = h()

// Somehow this isn’t the expected `'wooorm'`.
const username = {
  type: 'element',
  tagName: 'script',
  children: [{type: 'text', value: 'alert(3)'}]
}

tree.children.push(h('span.handle', username))
```

Yields:

```html
<span class="handle"><script>alert(3)</script></span>
```

Either do not use user-provided input in `hastscript` or use
[`hast-util-santize`][hast-util-sanitize].

## Related

*   [`unist-builder`](https://github.com/syntax-tree/unist-builder)
    — create unist trees
*   [`xastscript`](https://github.com/syntax-tree/xastscript)
    — create xast trees
*   [`hast-to-hyperscript`](https://github.com/syntax-tree/hast-to-hyperscript)
    — turn hast into React, Preact, Vue, etc
*   [`hast-util-to-html`](https://github.com/syntax-tree/hast-util-to-html)
    — turn hast into HTML
*   [`hast-util-to-dom`](https://github.com/syntax-tree/hast-util-to-dom)
    — turn hast into DOM trees
*   [`estree-util-build-jsx`](https://github.com/syntax-tree/estree-util-build-jsx)
    — compile JSX away

## Contribute

See [`contributing.md`][contributing] in [`syntax-tree/.github`][health] for
started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/syntax-tree/hastscript/workflows/main/badge.svg

[build]: https://github.com/syntax-tree/hastscript/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/syntax-tree/hastscript.svg

[coverage]: https://codecov.io/github/syntax-tree/hastscript

[downloads-badge]: https://img.shields.io/npm/dm/hastscript.svg

[downloads]: https://www.npmjs.com/package/hastscript

[size-badge]: https://img.shields.io/bundlephobia/minzip/hastscript.svg

[size]: https://bundlephobia.com/result?p=hastscript

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

[hast]: https://github.com/syntax-tree/hast

[element]: https://github.com/syntax-tree/hast#element

[root]: https://github.com/syntax-tree/xast#root

[text]: https://github.com/syntax-tree/hast#text

[u]: https://github.com/syntax-tree/unist-builder

[x]: https://github.com/syntax-tree/xastscript

[parse-selector]: https://github.com/syntax-tree/hast-util-parse-selector

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[hast-util-sanitize]: https://github.com/syntax-tree/hast-util-sanitize

[child]: #child

[properties]: #properties-1

[result]: #result
