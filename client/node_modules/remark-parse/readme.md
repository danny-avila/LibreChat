# remark-parse

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[remark][]** plugin to add support for parsing markdown input.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`unified().use(remarkParse)`](#unifieduseremarkparse)
*   [Examples](#examples)
    *   [Example: support GFM and frontmatter](#example-support-gfm-and-frontmatter)
    *   [Example: turning markdown into a man page](#example-turning-markdown-into-a-man-page)
*   [Syntax](#syntax)
*   [Syntax tree](#syntax-tree)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Contribute](#contribute)
*   [Sponsor](#sponsor)
*   [License](#license)

## What is this?

This package is a [unified][] ([remark][]) plugin that defines how to take
markdown as input and turn it into a syntax tree.

This plugin is built on [`mdast-util-from-markdown`][mdast-util-from-markdown],
which in turn uses [`micromark`][micromark] for parsing markdown into tokens and
turns those into [mdast][] syntax trees.
remark focusses on making it easier to transform content by abstracting such
internals away.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**remark** adds support for markdown to unified.
**mdast** is the markdown AST that remark uses.
**micromark** is the markdown parser we use.
This is a remark plugin that defines how input markdown is turned into mdast.

## When should I use this?

This plugin adds support to unified for parsing markdown.
You can alternatively use [`remark`][remark-core] instead, which combines
unified, this plugin, and [`remark-stringify`][remark-stringify].

You can combine this plugin with other plugins to add syntax extensions.
Notable examples that deeply integrate with it are
[`remark-gfm`][remark-gfm],
[`remark-mdx`][remark-mdx],
[`remark-frontmatter`][remark-frontmatter],
[`remark-math`][remark-math], and
[`remark-directive`][remark-directive].
You can also use any other [remark plugin][plugin] after `remark-parse`.

If you *just* want to turn markdown into HTML (with maybe a few extensions),
we recommend [`micromark`][micromark] instead.
If you want to handle syntax trees manually, you can use
[`mdast-util-from-markdown`][mdast-util-from-markdown].

## Install

This package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).
In Node.js (version 12.20+, 14.14+, or 16.0+), install with [npm][]:

```sh
npm install remark-parse
```

In Deno with [`esm.sh`][esmsh]:

```js
import remarkParse from 'https://esm.sh/remark-parse@10'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import remarkParse from 'https://esm.sh/remark-parse@10?bundle'
</script>
```

## Use

Say we have the following module `example.js`:

```js
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

main()

async function main() {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process('# Hi\n\n*Hello*, world!')

  console.log(String(file))
}
```

Running that with `node example.js` yields:

```html
<h1>Hi</h1>
<p><em>Hello</em>, world!</p>
```

## API

This package exports no identifiers.
The default export is `remarkParse`.

### `unified().use(remarkParse)`

Add support for parsing markdown input.
There are no options.

## Examples

### Example: support GFM and frontmatter

We support CommonMark by default.
Non-standard markdown extensions can be enabled with plugins.
The following example adds support for GFM features (autolink literals,
footnotes, strikethrough, tables, tasklists) and frontmatter (YAML):

```js
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

main()

async function main() {
  const file = await unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process('---\nlayout: home\n---\n\n# Hi ~~Mars~~Venus!')

  console.log(String(file))
}
```

Yields:

```html
<h1>Hi <del>Mars</del>Venus!</h1>
```

### Example: turning markdown into a man page

Man pages (short for manual pages) are a way to document CLIs (example: type
`man git-log` in your terminal).
They use an old markup format called roff.
There’s a remark plugin, [`remark-man`][remark-man], that can serialize as roff.
The following example turns markdown into man pages by using unified with
`remark-parse` and `remark-man`:

```js
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkMan from 'remark-man'

main()

async function main() {
  const file = await unified()
    .use(remarkParse)
    .use(remarkMan)
    .process('# titan(7) -- largest moon of saturn\n\nTitan is the largest moon…')

  console.log(String(file))
}
```

Yields:

```roff
.TH "TITAN" "7" "November 2021" "" ""
.SH "NAME"
\fBtitan\fR - largest moon of saturn
.P
Titan is the largest moon…
```

## Syntax

Markdown is parsed according to CommonMark.
Other plugins can add support for syntax extensions.
If you’re interested in extending markdown,
[more information is available in micromark’s readme][micromark-extend].

## Syntax tree

The syntax tree format used in remark is [mdast][].

## Types

This package is fully typed with [TypeScript][].
There are no extra exported types.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Security

As markdown can be turned into HTML and improper use of HTML can open you up to
[cross-site scripting (XSS)][xss] attacks, use of remark can be unsafe.
When going to HTML, you will likely combine remark with **[rehype][]**, in which
case you should use [`rehype-sanitize`][rehype-sanitize].

Use of remark plugins could also open you up to other attacks.
Carefully assess each plugin and the risks involved in using them.

For info on how to submit a report, see our [security policy][security].

## Contribute

See [`contributing.md`][contributing] in [`remarkjs/.github`][health] for ways
to get started.
See [`support.md`][support] for ways to get help.
Join us in [Discussions][chat] to chat with the community and contributors.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## Sponsor

Support this effort and give back by sponsoring on [OpenCollective][collective]!

<!--lint ignore no-html-->

<table>
<tr valign="middle">
<td width="20%" align="center" rowspan="2" colspan="2">
  <a href="https://vercel.com">Vercel</a><br><br>
  <a href="https://vercel.com"><img src="https://avatars1.githubusercontent.com/u/14985020?s=256&v=4" width="128"></a>
</td>
<td width="20%" align="center" rowspan="2" colspan="2">
  <a href="https://motif.land">Motif</a><br><br>
  <a href="https://motif.land"><img src="https://avatars1.githubusercontent.com/u/74457950?s=256&v=4" width="128"></a>
</td>
<td width="20%" align="center" rowspan="2" colspan="2">
  <a href="https://www.hashicorp.com">HashiCorp</a><br><br>
  <a href="https://www.hashicorp.com"><img src="https://avatars1.githubusercontent.com/u/761456?s=256&v=4" width="128"></a>
</td>
<td width="20%" align="center" rowspan="2" colspan="2">
  <a href="https://www.gitbook.com">GitBook</a><br><br>
  <a href="https://www.gitbook.com"><img src="https://avatars1.githubusercontent.com/u/7111340?s=256&v=4" width="128"></a>
</td>
<td width="20%" align="center" rowspan="2" colspan="2">
  <a href="https://www.gatsbyjs.org">Gatsby</a><br><br>
  <a href="https://www.gatsbyjs.org"><img src="https://avatars1.githubusercontent.com/u/12551863?s=256&v=4" width="128"></a>
</td>
</tr>
<tr valign="middle">
</tr>
<tr valign="middle">
<td width="20%" align="center" rowspan="2" colspan="2">
  <a href="https://www.netlify.com">Netlify</a><br><br>
  <!--OC has a sharper image-->
  <a href="https://www.netlify.com"><img src="https://images.opencollective.com/netlify/4087de2/logo/256.png" width="128"></a>
</td>
<td width="10%" align="center">
  <a href="https://www.coinbase.com">Coinbase</a><br><br>
  <a href="https://www.coinbase.com"><img src="https://avatars1.githubusercontent.com/u/1885080?s=256&v=4" width="64"></a>
</td>
<td width="10%" align="center">
  <a href="https://themeisle.com">ThemeIsle</a><br><br>
  <a href="https://themeisle.com"><img src="https://avatars1.githubusercontent.com/u/58979018?s=128&v=4" width="64"></a>
</td>
<td width="10%" align="center">
  <a href="https://expo.io">Expo</a><br><br>
  <a href="https://expo.io"><img src="https://avatars1.githubusercontent.com/u/12504344?s=128&v=4" width="64"></a>
</td>
<td width="10%" align="center">
  <a href="https://boostnote.io">Boost Note</a><br><br>
  <a href="https://boostnote.io"><img src="https://images.opencollective.com/boosthub/6318083/logo/128.png" width="64"></a>
</td>
<td width="10%" align="center">
  <a href="https://www.holloway.com">Holloway</a><br><br>
  <a href="https://www.holloway.com"><img src="https://avatars1.githubusercontent.com/u/35904294?s=128&v=4" width="64"></a>
</td>
<td width="10%"></td>
<td width="10%"></td>
<td width="10%"></td>
</tr>
<tr valign="middle">
<td width="100%" align="center" colspan="8">
  <br>
  <a href="https://opencollective.com/unified"><strong>You?</strong></a>
  <br><br>
</td>
</tr>
</table>

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/remarkjs/remark/workflows/main/badge.svg

[build]: https://github.com/remarkjs/remark/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/remarkjs/remark.svg

[coverage]: https://codecov.io/github/remarkjs/remark

[downloads-badge]: https://img.shields.io/npm/dm/remark-parse.svg

[downloads]: https://www.npmjs.com/package/remark-parse

[size-badge]: https://img.shields.io/bundlephobia/minzip/remark-parse.svg

[size]: https://bundlephobia.com/result?p=remark-parse

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/remarkjs/remark/discussions

[security]: https://github.com/remarkjs/.github/blob/main/security.md

[health]: https://github.com/remarkjs/.github

[contributing]: https://github.com/remarkjs/.github/blob/main/contributing.md

[support]: https://github.com/remarkjs/.github/blob/main/support.md

[coc]: https://github.com/remarkjs/.github/blob/main/code-of-conduct.md

[license]: https://github.com/remarkjs/remark/blob/main/license

[author]: https://wooorm.com

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[unified]: https://github.com/unifiedjs/unified

[remark]: https://github.com/remarkjs/remark

[mdast]: https://github.com/syntax-tree/mdast

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[typescript]: https://www.typescriptlang.org

[rehype]: https://github.com/rehypejs/rehype

[rehype-sanitize]: https://github.com/rehypejs/rehype-sanitize

[mdast-util-from-markdown]: https://github.com/syntax-tree/mdast-util-from-markdown

[micromark]: https://github.com/micromark/micromark

[micromark-extend]: https://github.com/micromark/micromark#extensions

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[remark-mdx]: https://github.com/mdx-js/mdx/tree/main/packages/remark-mdx

[remark-frontmatter]: https://github.com/remarkjs/remark-frontmatter

[remark-math]: https://github.com/remarkjs/remark-math

[remark-man]: https://github.com/remarkjs/remark-man

[remark-directive]: https://github.com/remarkjs/remark-directive

[remark-stringify]: ../remark-stringify/

[remark-core]: ../remark/

[plugin]: https://github.com/remarkjs/remark#plugin
