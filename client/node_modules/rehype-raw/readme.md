# rehype-raw

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[rehype][]** plugin to parse the tree (and raw nodes) again, keeping
positional info okay.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`unified().use(rehypeRaw[, options])`](#unifieduserehyperaw-options)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a [unified][] ([rehype][]) plugin to parse a document again.
To understand how it works, requires knowledge of ASTs (specifically, [hast][]).
This plugin passes each node and embedded raw HTML through an HTML parser
([`parse5`][parse5]), to recreate a tree exactly as how a browser would parse
it, while keeping the original data and positional info intact.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**rehype** adds support for HTML to unified.
**hast** is the HTML AST that rehype uses.
This is a rehype plugin that parses the tree again.

## When should I use this?

This plugin is particularly useful when coming from markdown and wanting to
support HTML embedded inside that markdown (which requires passing
`allowDangerousHtml: true` to `remark-rehype`).
Markdown dictates how, say, a list item or emphasis can be parsed.
We can use that to turn the markdown syntax tree into an HTML syntax tree.
But markdown also dictates that things that look like HTML, are passed through
untouched, even when it just looks like XML but doesn’t really make sense, so we
can’t normally use these strings of “HTML” to create an HTML syntax tree.
This plugin can.
It can be used to take those strings of HTML and include them into the syntax
tree as actual nodes.

If your final result is HTML and you trust content, then “strings” are fine
(you can pass `allowDangerousHtml: true` to `rehype-stringify`, which passes
HTML through untouched).
But there are two main cases where a proper syntax tree is preferred:

*   rehype plugins need a proper syntax tree as they operate on actual nodes to
    inspect or transform things, they can’t operate on strings of HTML
*   other output formats (React, MDX, etc) need actual nodes and can’t handle
    strings of HTML

This plugin is built on [`hast-util-raw`][hast-util-raw], which does the work on
syntax trees.
rehype focusses on making it easier to transform content by abstracting such
internals away.

## Install

This package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).
In Node.js (version 12.20+, 14.14+, or 16.0+), install with [npm][]:

```sh
npm install rehype-raw
```

In Deno with [Skypack][]:

```js
import rehypeRaw from 'https://cdn.skypack.dev/rehype-raw@6?dts'
```

In browsers with [Skypack][]:

```html
<script type="module">
  import rehypeRaw from 'https://cdn.skypack.dev/rehype-raw@6?min'
</script>
```

## Use

Say we have the following markdown file `example.md`:

```markdown
<div class="note">

A mix of *markdown* and <em>HTML</em>.

</div>
```

And our module `example.js` looks as follows:

```js
import {read} from 'to-vfile'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeDocument from 'rehype-document'
import rehypeFormat from 'rehype-format'
import rehypeStringify from 'rehype-stringify'

main()

async function main() {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype, {allowDangerousHtml: true})
    .use(rehypeRaw)
    .use(rehypeDocument, {title: '🙌'})
    .use(rehypeFormat)
    .use(rehypeStringify)
    .process(await read('example.md'))

  console.log(String(file))
}
```

Now running `node example.js` yields:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>🙌</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <div class="note">
      <p>A mix of <em>markdown</em> and <em>HTML</em>.</p>
    </div>
  </body>
</html>
```

## API

This package exports no identifiers.
The default export is `rehypeRaw`.

### `unified().use(rehypeRaw[, options])`

Parse the tree (and raw nodes) again, keeping positional info okay.

##### `options`

Configuration (optional).

###### `options.passThrough`

This option is a bit advanced as it requires knowledge of ASTs, so we defer
to the documentation available in [`hast-util-raw`][hast-util-raw].

## Types

This package is fully typed with [TypeScript][].
It exports an `Options` type, which specifies the interface of the accepted
options.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

This plugin works with `rehype-parse` version 1+, `rehype-stringify` version 1+,
`rehype` version 1+, and `unified` version 4+.

## Security

The `allowDangerousHtml` option in `remark-rehype` is dangerous, so defer
to that plugin on how to make it safe.
Otherwise, this plugin is safe.

## Contribute

See [`contributing.md`][contributing] in [`rehypejs/.github`][health] for ways
to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/rehypejs/rehype-raw/workflows/main/badge.svg

[build]: https://github.com/rehypejs/rehype-raw/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/rehypejs/rehype-raw.svg

[coverage]: https://codecov.io/github/rehypejs/rehype-raw

[downloads-badge]: https://img.shields.io/npm/dm/rehype-raw.svg

[downloads]: https://www.npmjs.com/package/rehype-raw

[size-badge]: https://img.shields.io/bundlephobia/minzip/rehype-raw.svg

[size]: https://bundlephobia.com/result?p=rehype-raw

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/rehypejs/rehype/discussions

[npm]: https://docs.npmjs.com/cli/install

[skypack]: https://www.skypack.dev

[health]: https://github.com/rehypejs/.github

[contributing]: https://github.com/rehypejs/.github/blob/HEAD/contributing.md

[support]: https://github.com/rehypejs/.github/blob/HEAD/support.md

[coc]: https://github.com/rehypejs/.github/blob/HEAD/code-of-conduct.md

[license]: license

[author]: https://wooorm.com

[typescript]: https://www.typescriptlang.org

[unified]: https://github.com/unifiedjs/unified

[rehype]: https://github.com/rehypejs/rehype

[hast]: https://github.com/syntax-tree/hast

[hast-util-raw]: https://github.com/syntax-tree/hast-util-raw

[parse5]: https://github.com/inikulin/parse5
