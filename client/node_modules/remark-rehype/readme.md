# remark-rehype

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

**[remark][]** plugin that turns markdown into HTML to support **[rehype][]**.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`unified().use(remarkRehype[, destination][, options])`](#unifieduseremarkrehype-destination-options)
    *   [`defaultHandlers`](#defaulthandlers)
    *   [`all`](#all)
    *   [`one`](#one)
*   [Examples](#examples)
    *   [Example: supporting HTML in markdown naïvely](#example-supporting-html-in-markdown-naïvely)
    *   [Example: supporting HTML in markdown properly](#example-supporting-html-in-markdown-properly)
    *   [Example: footnotes in languages other than English](#example-footnotes-in-languages-other-than-english)
*   [Syntax tree](#syntax-tree)
*   [CSS](#css)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a [unified][] ([remark][]) plugin that switches from remark (the
markdown ecosystem) to rehype (the HTML ecosystem).
It does this by transforming the current markdown (mdast) syntax tree into an
HTML (hast) syntax tree.
remark plugins deal with mdast and rehype plugins deal with hast, so plugins
used after `remark-rehype` have to be rehype plugins.

The reason that there are different ecosystems for markdown and HTML is that
turning markdown into HTML is, while frequently needed, not the only purpose of
markdown.
Checking (linting) and formatting markdown are also common use cases for
remark and markdown.
There are several aspects of markdown that do not translate 1-to-1 to HTML.
In some cases markdown contains more information than HTML: for example, there
are several ways to add a link in markdown (as in, autolinks: `<https://url>`,
resource links: `[label](url)`, and reference links with definitions:
`[label][id]` and `[id]: url`).
In other cases HTML contains more information than markdown: there are many
tags, which add new meaning (semantics), available in HTML that aren’t available
in markdown.
If there was just one AST, it would be quite hard to perform the tasks that
several remark and rehype plugins currently do.

**unified** is a project that transforms content with abstract syntax trees
(ASTs).
**remark** adds support for markdown to unified.
**rehype** adds support for HTML to unified.
**mdast** is the markdown AST that remark uses.
**hast** is the markdown AST that rehype uses.
This is a remark plugin that transforms mdast into hast to support rehype.

## When should I use this?

This project is useful when you want to turn markdown to HTML.
It opens up a whole new ecosystem with tons of plugins to do all kinds of
things.
You can [minify HTML][rehype-minify], [format HTML][rehype-format],
[make sure it’s safe][rehype-sanitize], [highlight code][rehype-highlight],
[add metadata][rehype-meta], and a lot more.

A different plugin, [`rehype-raw`][rehype-raw], adds support for raw HTML
written inside markdown.
This is a separate plugin because supporting HTML inside markdown is a heavy
task and not always needed.
To use both together, you also have to configure `remark-rehype` with
`allowDangerousHtml: true`.

The rehype plugin [`rehype-remark`][rehype-remark] does the inverse of this
plugin.
It turns HTML into markdown.

## Install

This package is [ESM only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).
In Node.js (version 12.20+, 14.14+, or 16.0+), install with [npm][]:

```sh
npm install remark-rehype
```

In Deno with [Skypack][]:

```js
import remarkRehype from 'https://cdn.skypack.dev/remark-rehype@10?dts'
```

In browsers with [Skypack][]:

```html
<script type="module">
  import remarkRehype from 'https://cdn.skypack.dev/remark-rehype@10?min'
</script>
```

## Use

Say we have the following file `example.md`:

```markdown
# Hello world

> Block quote.

Some _emphasis_, **importance**, and `code`.
```

And our module `example.js` looks as follows:

```js
import {read} from 'to-vfile'
import {reporter} from 'vfile-reporter'
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeDocument from 'rehype-document'
import rehypeFormat from 'rehype-format'
import rehypeStringify from 'rehype-stringify'

main()

async function main() {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeDocument)
    .use(rehypeFormat)
    .use(rehypeStringify)
    .process(await read('example.md'))

  console.error(reporter(file))
  console.log(String(file))
}
```

Now, running `node example.js` yields:

```txt
example.md: no issues found
```

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>example</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
  </head>
  <body>
    <h1>Hello world</h1>
    <blockquote>
      <p>Block quote.</p>
    </blockquote>
    <p>Some <em>emphasis</em>, <strong>importance</strong>, and <code>code</code>.</p>
  </body>
</html>
```

## API

This package exports `defaultHandlers`, `all`, and `one`.
The default export is `remarkRehype`.

### `unified().use(remarkRehype[, destination][, options])`

Plugin that turns markdown into HTML to support rehype.

##### `destination`

If a [`Unified`][processor] destination processor is given, that processor runs
with a new HTML (hast) tree (bridge-mode).
As the given processor runs with a hast tree, and rehype plugins support
hast, that means rehype plugins can be used with the given processor.
The hast tree is discarded in the end.

> 👉 **Note**: It’s highly unlikely that you want to do this.

##### `options`

Configuration (optional).

###### `options.allowDangerousHtml`

Whether to persist raw HTML in markdown in the hast tree (`boolean`, default:
`false`).
Raw HTML is available in the markdown (mdast) tree as [`html`][mdast-html] nodes
and can be embedded in the HTML (hast) tree as semistandard `raw` nodes.
Most rehype plugins ignore `raw` nodes, but two notable plugins don’t:

*   [`rehype-stringify`][rehype-stringify] also has an option
    `allowDangerousHtml` which will output the raw HTML.
    This is typically discouraged as noted by the option name but is useful if
    you completely trust who authors the markdown
*   [`rehype-raw`][rehype-raw] can handle the raw embedded HTML strings in hast
    trees by parsing them into standard hast nodes (element, text, etc).
    This is a heavy task as it needs a full HTML parser, but it is the only way
    to support untrusted content

###### `options.clobberPrefix`

Prefix to use before the `id` attribute on footnotes to prevent it from
*clobbering* (`string`, default: `'user-content-'`).
DOM clobbering is this:

```html
<p id=x></p>
<script>alert(x) // `x` now refers to the DOM `p#x` element</script>
```

Elements by their ID are made available by browsers on the `window` object,
which is a security risk.
Using a prefix solves this problem.

> 👉 **Note**: this option affects footnotes.
> Footnotes are not specified by CommonMark so they’re not supported in remark
> by default.
> They are supported by GitHub, so they can be enabled by using the remark
> plugin [`remark-gfm`][remark-gfm].

###### `options.footnoteLabel`

Label to use for the footnotes section (`string`, default: `'Footnotes'`).
Affects screen readers.
Change it when the markdown is not in English.

> 👉 **Note**: this option affects footnotes.
> Footnotes are not specified by CommonMark so they’re not supported in remark
> by default.
> They are supported by GitHub, so they can be enabled by using the remark
> plugin [`remark-gfm`][remark-gfm].

###### `options.footnoteBackLabel`

Label to use from backreferences back to their footnote call (`string`, default:
`'Back to content'`).
Affects screen readers.
Change it when the markdown is not in English.

> 👉 **Note**: this option affects footnotes.
> Footnotes are not specified by CommonMark so they’re not supported in remark
> by default.
> They are supported by GitHub, so they can be enabled by using the remark
> plugin [`remark-gfm`][remark-gfm].

###### `options.handlers`

This option is a bit advanced as it requires knowledge of ASTs, so we defer
to the documentation available in [`mdast-util-to-hast`][mdast-util-to-hast].

###### `options.passThrough`

This option is a bit advanced as it requires knowledge of ASTs, so we defer
to the documentation available in [`mdast-util-to-hast`][mdast-util-to-hast].

###### `options.unknownHandler`

This option is a bit advanced as it requires knowledge of ASTs, so we defer
to the documentation available in [`mdast-util-to-hast`][mdast-util-to-hast].

### `defaultHandlers`

The `defaultHandlers` export from [`mdast-util-to-hast`][mdast-util-to-hast],
useful when passing in your own handlers.

### `all`

The `all` export from [`mdast-util-to-hast`][mdast-util-to-hast],
useful when passing in your own handlers.

### `one`

The `one` export from [`mdast-util-to-hast`][mdast-util-to-hast],
useful when passing in your own handlers.

## Examples

### Example: supporting HTML in markdown naïvely

If you completely trust the authors of the input markdown and want to allow them
to write HTML inside markdown, you can pass `allowDangerousHtml` to this plugin
(`remark-rehype`) and `rehype-stringify`:

```js
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

main()

async function main() {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype, {allowDangerousHtml: true})
    .use(rehypeStringify, {allowDangerousHtml: true})
    .process('It <i>works</i>! <img onerror="alert(1)">')

  console.log(String(file))
}
```

Running that code yields:

```html
<p>It <i>works</i>! <img onerror="alert(1)"></p>
```

> ⚠️ **Danger**: Observe that the XSS attack through the `onerror` attribute
> is still present.

### Example: supporting HTML in markdown properly

If you do not trust the authors of the input markdown, or if you want to make
sure that rehype plugins can see HTML embedded in markdown, use
[`rehype-raw`][rehype-raw].
The following example passes `allowDangerousHtml` to this plugin
(`remark-rehype`), then turns the raw embedded HTML into proper HTML nodes
(`rehype-raw`), and finally sanitizes the HTML by only allowing safe things
(`rehype-sanitize`):

```js
import {unified} from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'

main()

async function main() {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype, {allowDangerousHtml: true})
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process('It <i>works</i>! <img onerror="alert(1)">')

  console.log(String(file))
}
```

Running that code yields:

```html
<p>It <i>works</i>! <img></p>
```

> 👉 **Note**: Observe that the XSS attack through the `onerror` attribute
> is no longer present.

### Example: footnotes in languages other than English

If you know that the markdown is authored in a language other than English,
and you’re using `remark-gfm` to match how GitHub renders markdown, and you know
that footnotes are (or can?) be used, you should translate the labels associated
with them.

Let’s first set the stage:

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
    .process('Hallo[^1]\n\n[^1]: Wereld!')

  console.log(String(file))
}
```

Running that code yields:

```html
<p>Hallo<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref aria-describedby="footnote-label">1</a></sup></p>
<section data-footnotes class="footnotes"><h2 id="footnote-label" class="sr-only">Footnotes</h2>
<ol>
<li id="user-content-fn-1">
<p>Wereld! <a href="#user-content-fnref-1" data-footnote-backref class="data-footnote-backref" aria-label="Back to content">↩</a></p>
</li>
</ol>
</section>
```

This is a mix of English and Dutch that screen readers can’t handle nicely.
Let’s say our program does know that the markdown is in Dutch.
In that case, it’s important to translate and define the labels relating to
footnotes so that screen reader users can properly pronounce the page:

```diff
@@ -10,7 +10,7 @@ async function main() {
   const file = await unified()
     .use(remarkParse)
     .use(remarkGfm)
-    .use(remarkRehype)
+    .use(remarkRehype, {footnoteLabel: 'Voetnoten', footnoteBackLabel: 'Terug'})
     .use(rehypeStringify)
     .process('Hallo[^1]\n\n[^1]: Wereld!')
```

Running the code with the above patch applied, yields:

```diff
@@ -1,8 +1,8 @@
 <p>Hallo<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref aria-describedby="footnote-label">1</a></sup></p>
-<section data-footnotes class="footnotes"><h2 id="footnote-label" class="sr-only">Footnotes</h2>
+<section data-footnotes class="footnotes"><h2 id="footnote-label" class="sr-only">Voetnoten</h2>
 <ol>
 <li id="user-content-fn-1">
-<p>Wereld! <a href="#user-content-fnref-1" data-footnote-backref class="data-footnote-backref" aria-label="Back to content">↩</a></p>
+<p>Wereld! <a href="#user-content-fnref-1" data-footnote-backref class="data-footnote-backref" aria-label="Terug">↩</a></p>
 </li>
 </ol>
 </section>
```

## Syntax tree

A frequent problem arises when having to turn one syntax tree into another.
As the original tree (in this case, mdast for markdown) is in some cases
limited compared to the destination (in this case, hast for HTML) tree,
is it possible to provide more info in the original to define what the
result will be in the destination?
This is possible by defining data on mdast nodes, which this plugin will read
as instructions on what hast nodes to create.

An example is `remark-math`, which defines semistandard math nodes that this
plugin doesn’t understand.
To solve this, `remark-math` defines instructions on mdast nodes that this
plugin does understand because they define a certain hast structure.

As these instructions are somewhat advanced in that they requires knowledge of
ASTs, we defer to the documentation available in the low level utility we use:
[`mdast-util-to-hast`][mdast-util-to-hast].

## CSS

Assuming you know how to use (semantic) HTML and CSS, then it should generally
be straight forward to style the HTML produced by this plugin.
With CSS, you can get creative and style the results as you please.

Some semistandard features, notably [`remark-gfm`][remark-gfm]s tasklists and
footnotes, generate HTML that be unintuitive, as it matches exactly what GitHub
produces for their website.
There is a project, [`sindresorhus/github-markdown-css`][github-markdown-css],
that exposes the stylesheet that GitHub uses for rendered markdown, which might
either be inspirational for more complex features, or can be used as-is to
exactly match how GitHub styles rendered markdown.

## Types

This package is fully typed with [TypeScript][].
It exports `Options` and `Processor` types, which specify the interfaces of the
accepted options.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

This plugin works with `unified` version 6+, `remark-parse` version 3+ (used in
`remark` version 7), and `rehype-stringify` version 3+ (used in `rehype`
version 5).

## Security

Use of `remark-rehype` can open you up to a [cross-site scripting (XSS)][xss]
attack.
Embedded **[hast][]** properties (`hName`, `hProperties`, `hChildren`) in
[mdast][], custom handlers, and the `allowDangerousHtml` option all provide
openings.
Use [`rehype-sanitize`][rehype-sanitize] to make the tree safe.

## Related

*   [`rehype-raw`][rehype-raw]
    — rehype plugin to parse the tree again and support `raw` nodes
*   [`rehype-sanitize`][rehype-sanitize]
    — rehype plugin to sanitize HTML
*   [`rehype-remark`](https://github.com/rehypejs/rehype-remark)
    — rehype plugin to turn HTML into markdown
*   [`rehype-retext`](https://github.com/rehypejs/rehype-retext)
    — rehype plugin to support retext
*   [`remark-retext`](https://github.com/remarkjs/remark-retext)
    — remark plugin to support retext

## Contribute

See [`contributing.md`][contributing] in [`remarkjs/.github`][health] for ways
to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/remarkjs/remark-rehype/workflows/main/badge.svg

[build]: https://github.com/remarkjs/remark-rehype/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/remarkjs/remark-rehype.svg

[coverage]: https://codecov.io/github/remarkjs/remark-rehype

[downloads-badge]: https://img.shields.io/npm/dm/remark-rehype.svg

[downloads]: https://www.npmjs.com/package/remark-rehype

[size-badge]: https://img.shields.io/bundlephobia/minzip/remark-rehype.svg

[size]: https://bundlephobia.com/result?p=remark-rehype

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/remarkjs/remark/discussions

[npm]: https://docs.npmjs.com/cli/install

[skypack]: https://www.skypack.dev

[health]: https://github.com/remarkjs/.github

[contributing]: https://github.com/remarkjs/.github/blob/HEAD/contributing.md

[support]: https://github.com/remarkjs/.github/blob/HEAD/support.md

[coc]: https://github.com/remarkjs/.github/blob/HEAD/code-of-conduct.md

[license]: license

[author]: https://wooorm.com

[processor]: https://github.com/unifiedjs/unified#processor

[remark]: https://github.com/remarkjs/remark

[rehype]: https://github.com/rehypejs/rehype

[unified]: https://github.com/unifiedjs/unified

[xss]: https://en.wikipedia.org/wiki/Cross-site_scripting

[typescript]: https://www.typescriptlang.org

[rehype-minify]: https://github.com/rehypejs/rehype-minify

[rehype-format]: https://github.com/rehypejs/rehype-format

[rehype-sanitize]: https://github.com/rehypejs/rehype-sanitize

[rehype-highlight]: https://github.com/rehypejs/rehype-highlight

[rehype-meta]: https://github.com/rehypejs/rehype-meta

[rehype-raw]: https://github.com/rehypejs/rehype-raw

[rehype-remark]: https://github.com/rehypejs/rehype-remark

[rehype-stringify]: https://github.com/rehypejs/rehype/tree/main/packages/rehype-stringify

[mdast-html]: https://github.com/syntax-tree/mdast#html

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[mdast-util-to-hast]: https://github.com/syntax-tree/mdast-util-to-hast

[mdast]: https://github.com/syntax-tree/mdast

[hast]: https://github.com/syntax-tree/hast

[github-markdown-css]: https://github.com/sindresorhus/github-markdown-css
