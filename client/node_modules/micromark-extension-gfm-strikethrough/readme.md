# micromark-extension-gfm-strikethrough

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[micromark][] extensions to support GFM [strikethrough][].

## Contents

*   [What is this?](#what-is-this)
*   [When to use this](#when-to-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`gfmStrikethrough(options?)`](#gfmstrikethroughoptions)
    *   [`gfmStrikethroughHtml`](#gfmstrikethroughhtml)
    *   [`Options`](#options)
*   [Authoring](#authoring)
*   [HTML](#html)
*   [CSS](#css)
*   [Syntax](#syntax)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package contains extensions that add support for strikethrough as enabled
by GFM to [`micromark`][micromark].

## When to use this

This project is useful when you want to support strikethrough in markdown.

You can use these extensions when you are working with [`micromark`][micromark].
To support all GFM features, use
[`micromark-extension-gfm`][micromark-extension-gfm].

When you need a syntax tree, you can combine this package with
[`mdast-util-gfm-strikethrough`][mdast-util-gfm-strikethrough].

All these packages are used [`remark-gfm`][remark-gfm], which focusses on making
it easier to transform content by abstracting these internals away.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+), install with [npm][]:

```sh
npm install micromark-extension-gfm-strikethrough
```

In Deno with [`esm.sh`][esmsh]:

```js
import {gfmStrikethrough, gfmStrikethroughHtml} from 'https://esm.sh/micromark-extension-gfm-strikethrough@1'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {gfmStrikethrough, gfmStrikethroughHtml} from 'https://esm.sh/micromark-extension-gfm-strikethrough@1?bundle'
</script>
```

## Use

```js
import {micromark} from 'micromark'
import {
  gfmStrikethrough,
  gfmStrikethroughHtml
} from 'micromark-extension-gfm-strikethrough'

const output = micromark('Some ~strikethrough~.', {
  extensions: [gfmStrikethrough()],
  htmlExtensions: [gfmStrikethroughHtml]
})

console.log(output)
```

Yields:

```html
<p>Some <del>strikethrough</del></p>.
```

## API

This package exports the identifiers
[`gfmStrikethrough`][api-gfm-strikethrough] and
[`gfmStrikethroughHtml`][api-gfm-strikethrough-html].
There is no default export.

The export map supports the [`development` condition][development].
Run `node --conditions development module.js` to get instrumented dev code.
Without this condition, production code is loaded.

### `gfmStrikethrough(options?)`

Create an extension for `micromark` to enable GFM strikethrough syntax.

###### Parameters

*   `options` ([`Options`][api-options], optional)
    — configuration

###### Returns

Extension for `micromark` that can be passed in `extensions`, to
enable GFM strikethrough syntax ([`Extension`][micromark-extension]).

### `gfmStrikethroughHtml`

Extension for `micromark` that can be passed in `htmlExtensions`, to support
GFM strikethrough when serializing to HTML
([`HtmlExtension`][micromark-html-extension]).

### `Options`

Configuration (TypeScript type).

###### Fields

*   `singleTilde` (`boolean`, default: `true`)
    — whether to support strikethrough with a single tilde.
    Single tildes work on github.com, but are technically prohibited by the GFM
    spec

## Authoring

When authoring markdown with strikethrough, it is recommended to use two
markers.
While `github.com` allows single tildes too, it technically prohibits it in
their spec.

## HTML

When tilde sequences match, they together relate to the `<del>` element in
HTML.
See [*§ 4.7.2 The `del` element*][html-del] in the HTML spec for more info.

## CSS

GitHub itself does not apply interesting CSS to `del` elements.
It currently (July 2022) does change `code` in `del`.

```css
del code {
  text-decoration: inherit;
}
```

For the complete actual CSS see
[`sindresorhus/github-markdown-css`][github-markdown-css].

## Syntax

Strikethrough sequences form with the following BNF:

```bnf
gfm_attention_sequence ::= 1*'~'
```

Sequences are matched together to form strikethrough based on which character
they contain, how long they are, and what character occurs before and after
each sequence.
Otherwise they are turned into data.

## Types

This package is fully typed with [TypeScript][].
It exports the additional type [`Options`][api-options].

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+.
Our projects sometimes work with older versions, but this is not guaranteed.

These extensions work with `micromark` version 3+.

## Security

This package is safe.

## Related

*   [`micromark-extension-gfm`][micromark-extension-gfm]
    — support all of GFM
*   [`mdast-util-gfm-strikethrough`][mdast-util-gfm-strikethrough]
    — support all of GFM in mdast
*   [`mdast-util-gfm`][mdast-util-gfm]
    — support all of GFM in mdast
*   [`remark-gfm`][remark-gfm]
    — support all of GFM in remark

## Contribute

See [`contributing.md` in `micromark/.github`][contributing] for ways to get
started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/micromark/micromark-extension-gfm-strikethrough/workflows/main/badge.svg

[build]: https://github.com/micromark/micromark-extension-gfm-strikethrough/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/micromark/micromark-extension-gfm-strikethrough.svg

[coverage]: https://codecov.io/github/micromark/micromark-extension-gfm-strikethrough

[downloads-badge]: https://img.shields.io/npm/dm/micromark-extension-gfm-strikethrough.svg

[downloads]: https://www.npmjs.com/package/micromark-extension-gfm-strikethrough

[size-badge]: https://img.shields.io/bundlephobia/minzip/micromark-extension-gfm-strikethrough.svg

[size]: https://bundlephobia.com/result?p=micromark-extension-gfm-strikethrough

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/micromark/micromark/discussions

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[license]: license

[author]: https://wooorm.com

[contributing]: https://github.com/micromark/.github/blob/main/contributing.md

[support]: https://github.com/micromark/.github/blob/main/support.md

[coc]: https://github.com/micromark/.github/blob/main/code-of-conduct.md

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[typescript]: https://www.typescriptlang.org

[development]: https://nodejs.org/api/packages.html#packages_resolving_user_conditions

[micromark]: https://github.com/micromark/micromark

[micromark-html-extension]: https://github.com/micromark/micromark#htmlextension

[micromark-extension]: https://github.com/micromark/micromark#syntaxextension

[micromark-extension-gfm]: https://github.com/micromark/micromark-extension-gfm

[mdast-util-gfm-strikethrough]: https://github.com/syntax-tree/mdast-util-gfm-strikethrough

[mdast-util-gfm]: https://github.com/syntax-tree/mdast-util-gfm

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[strikethrough]: https://github.github.com/gfm/#strikethrough-extension-

[github-markdown-css]: https://github.com/sindresorhus/github-markdown-css

[html-del]: https://html.spec.whatwg.org/multipage/edits.html#the-del-element

[api-gfm-strikethrough]: #gfmstrikethroughoptions

[api-gfm-strikethrough-html]: #gfmstrikethroughhtml

[api-options]: #options
