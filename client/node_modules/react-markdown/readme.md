<!--
Notes for maintaining this document:

*   Update the link for `cm-html` once in a while
-->

# react-markdown

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

React component to render markdown.

## Feature highlights

*   [x] **[safe][security] by default**
    (no `dangerouslySetInnerHTML` or XSS attacks)
*   [x] **[components][]**
    (pass your own component to use instead of `<h2>` for `## hi`)
*   [x] **[plugins][]**
    (many plugins you can pick and choose from)
*   [x] **[compliant][syntax]**
    (100% to CommonMark, 100% to GFM with a plugin)

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`props`](#props)
    *   [`uriTransformer`](#uritransformer)
*   [Examples](#examples)
    *   [Use a plugin](#use-a-plugin)
    *   [Use a plugin with options](#use-a-plugin-with-options)
    *   [Use custom components (syntax highlight)](#use-custom-components-syntax-highlight)
    *   [Use remark and rehype plugins (math)](#use-remark-and-rehype-plugins-math)
*   [Plugins](#plugins)
*   [Syntax](#syntax)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Architecture](#architecture)
*   [Appendix A: HTML in markdown](#appendix-a-html-in-markdown)
*   [Appendix B: Components](#appendix-b-components)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package is a [React][] component that can be given a string of markdown
that it’ll safely render to React elements.
You can pass plugins to change how markdown is transformed to React elements and
pass components that will be used instead of normal HTML elements.

*   to learn markdown, see this [cheatsheet and tutorial][cheat]
*   to try out `react-markdown`, see [our demo][demo]

## When should I use this?

There are other ways to use markdown in React out there so why use this one?
The two main reasons are that they often rely on `dangerouslySetInnerHTML` or
have bugs with how they handle markdown.
`react-markdown` uses a syntax tree to build the virtual dom which allows for
updating only the changing DOM instead of completely overwriting.
`react-markdown` is 100% CommonMark compliant and has plugins to support other
syntax extensions (such as GFM).

These features are supported because we use [unified][], specifically [remark][]
for markdown and [rehype][] for HTML, which are popular tools to transform
content with plugins.

This package focusses on making it easy for beginners to safely use markdown in
React.
When you’re familiar with unified, you can use a modern hooks based alternative
[`react-remark`][react-remark] or [`rehype-react`][rehype-react] manually.
If you instead want to use JavaScript and JSX *inside* markdown files, use
[MDX][].

## Install

This package is [ESM only][esm].
In Node.js (version 12.20+, 14.14+, or 16.0+), install with [npm][]:

```sh
npm install react-markdown
```

In Deno with [`esm.sh`][esmsh]:

```js
import ReactMarkdown from 'https://esm.sh/react-markdown@7'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import ReactMarkdown from 'https://esm.sh/react-markdown@7?bundle'
</script>
```

## Use

A basic hello world:

```jsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import ReactDom from 'react-dom'

ReactDom.render(<ReactMarkdown># Hello, *world*!</ReactMarkdown>, document.body)
```

<details>
<summary>Show equivalent JSX</summary>

```jsx
<h1>
  Hello, <em>world</em>!
</h1>
```

</details>

Here is an example that shows passing the markdown as a string and how
to use a plugin ([`remark-gfm`][gfm], which adds support for strikethrough,
tables, tasklists and URLs directly):

```jsx
import React from 'react'
import ReactDom from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const markdown = `Just a link: https://reactjs.com.`

ReactDom.render(
  <ReactMarkdown children={markdown} remarkPlugins={[remarkGfm]} />,
  document.body
)
```

<details>
<summary>Show equivalent JSX</summary>

```jsx
<p>
  Just a link: <a href="https://reactjs.com">https://reactjs.com</a>.
</p>
```

</details>

## API

This package exports the following identifier:
[`uriTransformer`][uri-transformer].
The default export is `ReactMarkdown`.

### `props`

*   `children` (`string`, default: `''`)\
    markdown to parse
*   `components` (`Record<string, Component>`, default: `{}`)\
    object mapping tag names to React components
*   `remarkPlugins` (`Array<Plugin>`, default: `[]`)\
    list of [remark plugins][remark-plugins] to use
*   `rehypePlugins` (`Array<Plugin>`, default: `[]`)\
    list of [rehype plugins][rehype-plugins] to use
*   `remarkRehypeOptions` (`Object?`, default: `undefined`)\
    options to pass through to [`remark-rehype`][remark-rehype]
*   `className` (`string?`)\
    wrap the markdown in a `div` with this class name
*   `skipHtml` (`boolean`, default: `false`)\
    ignore HTML in markdown completely
*   `sourcePos` (`boolean`, default: `false`)\
    pass a prop to all components with a serialized position
    (`data-sourcepos="3:1-3:13"`)
*   `rawSourcePos` (`boolean`, default: `false`)\
    pass a prop to all components with their [position][]
    (`sourcePosition: {start: {line: 3, column: 1}, end:…}`)
*   `includeElementIndex` (`boolean`, default: `false`)\
    pass the `index` (number of elements before it) and `siblingCount` (number
    of elements in parent) as props to all components
*   `allowedElements` (`Array<string>`, default: `undefined`)\
    tag names to allow (can’t combine w/ `disallowedElements`), all tag names
    are allowed by default
*   `disallowedElements` (`Array<string>`, default: `undefined`)\
    tag names to disallow (can’t combine w/ `allowedElements`), all tag names
    are allowed by default
*   `allowElement` (`(element, index, parent) => boolean?`, optional)\
    function called to check if an element is allowed (when truthy) or not,
    `allowedElements` or `disallowedElements` is used first!
*   `unwrapDisallowed` (`boolean`, default: `false`)\
    extract (unwrap) the children of not allowed elements, by default, when
    `strong` is disallowed, it and it’s children are dropped, but with
    `unwrapDisallowed` the element itself is replaced by its children
*   `linkTarget` (`string` or `(href, children, title) => string`, optional)\
    target to use on links (such as `_blank` for `<a target="_blank"…`)
*   `transformLinkUri` (`(href, children, title) => string`, default:
    [`uriTransformer`][uri-transformer], optional)\
    change URLs on links, pass `null` to allow all URLs, see [security][]
*   `transformImageUri` (`(src, alt, title) => string`, default:
    [`uriTransformer`][uri-transformer], optional)\
    change URLs on images, pass `null` to allow all URLs, see [security][]

### `uriTransformer`

Our default URL transform, which you can overwrite (see props above).
It’s given a URL and cleans it, by allowing only `http:`, `https:`, `mailto:`,
and `tel:` URLs, absolute paths (`/example.png`), and hashes (`#some-place`).

See the [source code here][uri].

## Examples

### Use a plugin

This example shows how to use a remark plugin.
In this case, [`remark-gfm`][gfm], which adds support for strikethrough, tables,
tasklists and URLs directly:

```jsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import ReactDom from 'react-dom'
import remarkGfm from 'remark-gfm'

const markdown = `A paragraph with *emphasis* and **strong importance**.

> A block quote with ~strikethrough~ and a URL: https://reactjs.org.

* Lists
* [ ] todo
* [x] done

A table:

| a | b |
| - | - |
`

ReactDom.render(
  <ReactMarkdown children={markdown} remarkPlugins={[remarkGfm]} />,
  document.body
)
```

<details>
<summary>Show equivalent JSX</summary>

```jsx
<>
  <p>
    A paragraph with <em>emphasis</em> and <strong>strong importance</strong>.
  </p>
  <blockquote>
    <p>
      A block quote with <del>strikethrough</del> and a URL:{' '}
      <a href="https://reactjs.org">https://reactjs.org</a>.
    </p>
  </blockquote>
  <ul>
    <li>Lists</li>
    <li>
      <input checked={false} readOnly={true} type="checkbox" /> todo
    </li>
    <li>
      <input checked={true} readOnly={true} type="checkbox" /> done
    </li>
  </ul>
  <p>A table:</p>
  <table>
    <thead>
      <tr>
        <td>a</td>
        <td>b</td>
      </tr>
    </thead>
  </table>
</>
```

</details>

### Use a plugin with options

This example shows how to use a plugin and give it options.
To do that, use an array with the plugin at the first place, and the options
second.
[`remark-gfm`][gfm] has an option to allow only double tildes for strikethrough:

```jsx
import React from 'react'
import ReactMarkdown from 'react-markdown'
import ReactDom from 'react-dom'
import remarkGfm from 'remark-gfm'

ReactDom.render(
  <ReactMarkdown remarkPlugins={[[remarkGfm, {singleTilde: false}]]}>
    This ~is not~ strikethrough, but ~~this is~~!
  </ReactMarkdown>,
  document.body
)
```

<details>
<summary>Show equivalent JSX</summary>

```jsx
<p>
  This ~is not~ strikethrough, but <del>this is</del>!
</p>
```

</details>

### Use custom components (syntax highlight)

This example shows how you can overwrite the normal handling of an element by
passing a component.
In this case, we apply syntax highlighting with the seriously super amazing
[`react-syntax-highlighter`][react-syntax-highlighter] by
[**@conorhastings**][conor]:

```jsx
import React from 'react'
import ReactDom from 'react-dom'
import ReactMarkdown from 'react-markdown'
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {dark} from 'react-syntax-highlighter/dist/esm/styles/prism'

// Did you know you can use tildes instead of backticks for code in markdown? ✨
const markdown = `Here is some JavaScript code:

~~~js
console.log('It works!')
~~~
`

ReactDom.render(
  <ReactMarkdown
    children={markdown}
    components={{
      code({node, inline, className, children, ...props}) {
        const match = /language-(\w+)/.exec(className || '')
        return !inline && match ? (
          <SyntaxHighlighter
            {...props}
            children={String(children).replace(/\n$/, '')}
            style={dark}
            language={match[1]}
            PreTag="div"
          />
        ) : (
          <code {...props} className={className}>
            {children}
          </code>
        )
      }
    }}
  />,
  document.body
)
```

<details>
<summary>Show equivalent JSX</summary>

```jsx
<>
  <p>Here is some JavaScript code:</p>
  <pre>
    <SyntaxHighlighter language="js" style={dark} PreTag="div" children="console.log('It works!')" />
  </pre>
</>
```

</details>

### Use remark and rehype plugins (math)

This example shows how a syntax extension (through [`remark-math`][math])
is used to support math in markdown, and a transform plugin
([`rehype-katex`][katex]) to render that math.

```jsx
import React from 'react'
import ReactDom from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import 'katex/dist/katex.min.css' // `rehype-katex` does not import the CSS for you

ReactDom.render(
  <ReactMarkdown
    children={`The lift coefficient ($C_L$) is a dimensionless coefficient.`}
    remarkPlugins={[remarkMath]}
    rehypePlugins={[rehypeKatex]}
  />,
  document.body
)
```

<details>
<summary>Show equivalent JSX</summary>

```jsx
<p>
  The lift coefficient (
  <span className="math math-inline">
    <span className="katex">
      <span className="katex-mathml">
        <math xmlns="http://www.w3.org/1998/Math/MathML">{/* … */}</math>
      </span>
      <span className="katex-html" aria-hidden="true">
        {/* … */}
      </span>
    </span>
  </span>
  ) is a dimensionless coefficient.
</p>
```

</details>

## Plugins

We use [unified][], specifically [remark][] for markdown and [rehype][] for
HTML, which are tools to transform content with plugins.
Here are three good ways to find plugins:

*   [`awesome-remark`][awesome-remark] and [`awesome-rehype`][awesome-rehype]
    — selection of the most awesome projects
*   [List of remark plugins][remark-plugins] and
    [list of rehype plugins][rehype-plugins]
    — list of all plugins
*   [`remark-plugin`][remark-plugin] and [`rehype-plugin`][rehype-plugin] topics
    — any tagged repo on GitHub

## Syntax

`react-markdown` follows CommonMark, which standardizes the differences between
markdown implementations, by default.
Some syntax extensions are supported through plugins.

We use [`micromark`][micromark] under the hood for our parsing.
See its documentation for more information on markdown, CommonMark, and
extensions.

## Types

This package is fully typed with [TypeScript][].
It exports `Options` and `Components` types, which specify the interface of the
accepted props and components.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 12.20+, 14.14+, and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.
They work in all modern browsers (essentially: everything not IE 11).
You can use a bundler (such as esbuild, webpack, or Rollup) to use this package
in your project, and use its options (or plugins) to add support for legacy
browsers.

## Architecture

<pre><code>                                                           react-markdown
         +----------------------------------------------------------------------------------------------------------------+
         |                                                                                                                |
         |  +----------+        +----------------+        +---------------+       +----------------+       +------------+ |
         |  |          |        |                |        |               |       |                |       |            | |
<a href="https://commonmark.org">markdown</a>-+->+  <a href="https://github.com/remarkjs/remark">remark</a>  +-<a href="https://github.com/syntax-tree/mdast">mdast</a>->+ <a href="https://github.com/remarkjs/remark/blob/main/doc/plugins.md">remark plugins</a> +-<a href="https://github.com/syntax-tree/mdast">mdast</a>->+ <a href="https://github.com/remarkjs/remark-rehype">remark-rehype</a> +-<a href="https://github.com/syntax-tree/hast">hast</a>->+ <a href="https://github.com/rehypejs/rehype/blob/main/doc/plugins.md">rehype plugins</a> +-<a href="https://github.com/syntax-tree/hast">hast</a>->+ <a href="#appendix-b-components">components</a> +-+->react elements
         |  |          |        |                |        |               |       |                |       |            | |
         |  +----------+        +----------------+        +---------------+       +----------------+       +------------+ |
         |                                                                                                                |
         +----------------------------------------------------------------------------------------------------------------+
</code></pre>

To understand what this project does, it’s important to first understand what
unified does: please read through the [`unifiedjs/unified`][unified] readme (the
part until you hit the API section is required reading).

`react-markdown` is a unified pipeline — wrapped so that most folks don’t need
to directly interact with unified.
The processor goes through these steps:

*   parse markdown to mdast (markdown syntax tree)
*   transform through remark (markdown ecosystem)
*   transform mdast to hast (HTML syntax tree)
*   transform through rehype (HTML ecosystem)
*   render hast to React with components

## Appendix A: HTML in markdown

`react-markdown` typically escapes HTML (or ignores it, with `skipHtml`)
because it is dangerous and defeats the purpose of this library.

However, if you are in a trusted environment (you trust the markdown), and
can spare the bundle size (±60kb minzipped), then you can use
[`rehype-raw`][raw]:

```jsx
import React from 'react'
import ReactDom from 'react-dom'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'

const input = `<div class="note">

Some *emphasis* and <strong>strong</strong>!

</div>`

ReactDom.render(
  <ReactMarkdown rehypePlugins={[rehypeRaw]} children={input} />,
  document.body
)
```

<details>
<summary>Show equivalent JSX</summary>

```jsx
<div class="note">
  <p>Some <em>emphasis</em> and <strong>strong</strong>!</p>
</div>
```

</details>

**Note**: HTML in markdown is still bound by how [HTML works in
CommonMark][cm-html].
Make sure to use blank lines around block-level HTML that again contains
markdown!

## Appendix B: Components

You can also change the things that come from markdown:

```jsx
<ReactMarkdown
  components={{
    // Map `h1` (`# heading`) to use `h2`s.
    h1: 'h2',
    // Rewrite `em`s (`*like so*`) to `i` with a red foreground color.
    em: ({node, ...props}) => <i style={{color: 'red'}} {...props} />
  }}
/>
```

The keys in components are HTML equivalents for the things you write with
markdown (such as `h1` for `# heading`).
Normally, in markdown, those are: `a`, `blockquote`, `br`, `code`, `em`, `h1`,
`h2`, `h3`, `h4`, `h5`, `h6`, `hr`, `img`, `li`, `ol`, `p`, `pre`, `strong`, and
`ul`.
With [`remark-gfm`][gfm], you can also use: `del`, `input`, `table`, `tbody`,
`td`, `th`, `thead`, and `tr`.
Other remark or rehype plugins that add support for new constructs will also
work with `react-markdown`.

The props that are passed are what you probably would expect: an `a` (link) will
get `href` (and `title`) props, and `img` (image) an `src`, `alt` and `title`,
etc.
There are some extra props passed.

*   `code`
    *   `inline` (`boolean?`)
        — set to `true` for inline code
    *   `className` (`string?`)
        — set to `language-js` or so when using ` ```js `
*   `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
    *   `level` (`number` between 1 and 6)
        — heading rank
*   `input` (when using [`remark-gfm`][gfm])
    *   `checked` (`boolean`)
        — whether the item is checked
    *   `disabled` (`true`)
    *   `type` (`'checkbox'`)
*   `li`
    *   `index` (`number`)
        — number of preceding items (so first gets `0`, etc.)
    *   `ordered` (`boolean`)
        — whether the parent is an `ol` or not
    *   `checked` (`boolean?`)
        — `null` normally, `boolean` when using [`remark-gfm`][gfm]’s tasklists
    *   `className` (`string?`)
        — set to `task-list-item` when using [`remark-gfm`][gfm] and the
        item1 is a tasklist
*   `ol`, `ul`
    *   `depth` (`number`)
        — number of ancestral lists (so first gets `0`, etc.)
    *   `ordered` (`boolean`)
        — whether it’s an `ol` or not
    *   `className` (`string?`)
        — set to `contains-task-list` when using [`remark-gfm`][gfm] and the
        list contains one or more tasklists
*   `td`, `th` (when using [`remark-gfm`][gfm])
    *   `style` (`Object?`)
        — something like `{textAlign: 'left'}` depending on how the cell is
        aligned
    *   `isHeader` (`boolean`)
        — whether it’s a `th` or not
*   `tr` (when using [`remark-gfm`][gfm])
    *   `isHeader` (`boolean`)
        — whether it’s in the `thead` or not

Every component will receive a `node` (`Object`).
This is the original [hast](https://github.com/syntax-tree/hast) element being
turned into a React element.

Every element will receive a `key` (`string`).
See [React’s docs](https://reactjs.org/docs/lists-and-keys.html#keys) for more
info.

Optionally, components will also receive:

*   `data-sourcepos` (`string`)
    — see `sourcePos` option
*   `sourcePosition` (`Object`)
    — see `rawSourcePos` option
*   `index` and `siblingCount` (`number`)
    — see `includeElementIndex` option
*   `target` on `a` (`string`)
    — see `linkTarget` option

## Security

Use of `react-markdown` is secure by default.
Overwriting `transformLinkUri` or `transformImageUri` to something insecure will
open you up to XSS vectors.
Furthermore, the `remarkPlugins`, `rehypePlugins`, and `components` you use may
be insecure.

To make sure the content is completely safe, even after what plugins do,
use [`rehype-sanitize`][sanitize].
It lets you define your own schema of what is and isn’t allowed.

## Related

*   [`MDX`](https://github.com/mdx-js/mdx)
    — JSX *in* markdown
*   [`remark-gfm`](https://github.com/remarkjs/remark-gfm)
    — add support for GitHub flavored markdown support
*   [`react-remark`][react-remark]
    — modern hook based alternative
*   [`rehype-react`][rehype-react]
    — turn HTML into React elements

## Contribute

See [`contributing.md`][contributing] in [`remarkjs/.github`][health] for ways
to get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Espen Hovlandsdal][author]

[build-badge]: https://github.com/remarkjs/react-markdown/workflows/main/badge.svg

[build]: https://github.com/remarkjs/react-markdown/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/remarkjs/react-markdown.svg

[coverage]: https://codecov.io/github/remarkjs/react-markdown

[downloads-badge]: https://img.shields.io/npm/dm/react-markdown.svg

[downloads]: https://www.npmjs.com/package/react-markdown

[size-badge]: https://img.shields.io/bundlephobia/minzip/react-markdown.svg

[size]: https://bundlephobia.com/result?p=react-markdown

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/remarkjs/remark/discussions

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[health]: https://github.com/remarkjs/.github

[contributing]: https://github.com/remarkjs/.github/blob/HEAD/contributing.md

[support]: https://github.com/remarkjs/.github/blob/HEAD/support.md

[coc]: https://github.com/remarkjs/.github/blob/HEAD/code-of-conduct.md

[license]: license

[author]: https://espen.codes/

[micromark]: https://github.com/micromark/micromark

[remark]: https://github.com/remarkjs/remark

[demo]: https://remarkjs.github.io/react-markdown/

[position]: https://github.com/syntax-tree/unist#position

[gfm]: https://github.com/remarkjs/remark-gfm

[math]: https://github.com/remarkjs/remark-math

[katex]: https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex

[raw]: https://github.com/rehypejs/rehype-raw

[sanitize]: https://github.com/rehypejs/rehype-sanitize

[remark-plugins]: https://github.com/remarkjs/remark/blob/main/doc/plugins.md#list-of-plugins

[rehype-plugins]: https://github.com/rehypejs/rehype/blob/main/doc/plugins.md#list-of-plugins

[remark-rehype]: https://github.com/remarkjs/remark-rehype

[awesome-remark]: https://github.com/remarkjs/awesome-remark

[awesome-rehype]: https://github.com/rehypejs/awesome-rehype

[remark-plugin]: https://github.com/topics/remark-plugin

[rehype-plugin]: https://github.com/topics/rehype-plugin

[cm-html]: https://spec.commonmark.org/0.30/#html-blocks

[uri]: https://github.com/remarkjs/react-markdown/blob/main/lib/uri-transformer.js

[uri-transformer]: #uritransformer

[react]: http://reactjs.org

[cheat]: https://commonmark.org/help/

[unified]: https://github.com/unifiedjs/unified

[rehype]: https://github.com/rehypejs/rehype

[react-remark]: https://github.com/remarkjs/react-remark

[rehype-react]: https://github.com/rehypejs/rehype-react

[mdx]: https://github.com/mdx-js/mdx/

[typescript]: https://www.typescriptlang.org

[security]: #security

[components]: #appendix-b-components

[plugins]: #plugins

[syntax]: #syntax

[react-syntax-highlighter]: https://github.com/react-syntax-highlighter/react-syntax-highlighter

[conor]: https://github.com/conorhastings

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c
