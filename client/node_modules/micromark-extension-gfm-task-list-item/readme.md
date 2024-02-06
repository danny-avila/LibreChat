# micromark-extension-gfm-task-list-item

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

[micromark][] extensions to support GFM [task list items][].

## Contents

*   [What is this?](#what-is-this)
*   [When to use this](#when-to-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`gfmTaskListItem`](#gfmtasklistitem)
    *   [`gfmTaskListItemHtml`](#gfmtasklistitemhtml)
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

This package contains extensions that add support for task lists as enabled by
GFM to [`micromark`][micromark].
It matches how task list items work on `github.com`.

## When to use this

This project is useful when you want to support task lists in markdown.

You can use these extensions when you are working with [`micromark`][micromark].
To support all GFM features, use
[`micromark-extension-gfm`][micromark-extension-gfm].

When you need a syntax tree, you can combine this package with
[`mdast-util-gfm-task-list-item`][mdast-util-gfm-task-list-item].

All these packages are used [`remark-gfm`][remark-gfm], which focusses on making
it easier to transform content by abstracting these internals away.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+), install with [npm][]:

```sh
npm install micromark-extension-gfm-task-list-item
```

In Deno with [`esm.sh`][esmsh]:

```js
import {gfmTaskListItem, gfmTaskListItemHtml} from 'https://esm.sh/micromark-extension-gfm-task-list-item@1'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {gfmTaskListItem, gfmTaskListItemHtml} from 'https://esm.sh/micromark-extension-gfm-task-list-item@1?bundle'
</script>
```

## Use

```js
import {micromark} from 'micromark'
import {
  gfmTaskListItem,
  gfmTaskListItemHtml
} from 'micromark-extension-gfm-task-list-item'

const output = micromark('* [x] a\n* [ ] b', {
  extensions: [gfmTaskListItem],
  htmlExtensions: [gfmTaskListItemHtml]
})

console.log(output)
```

Yields:

```html
<ul>
<li><input checked="" disabled="" type="checkbox"> a</li>
<li><input disabled="" type="checkbox"> b</li>
</ul>
```

## API

This package exports the identifiers [`gfmTaskListItem`][api-gfm-task-list-item]
and [`gfmTaskListItemHtml`][api-gfm-task-list-item-html].
There is no default export.

The export map supports the [`development` condition][development].
Run `node --conditions development module.js` to get instrumented dev code.
Without this condition, production code is loaded.

### `gfmTaskListItem`

Extension for `micromark` that can be passed in `extensions`, to enable GFM
task list items syntax ([`Extension`][micromark-extension]).

### `gfmTaskListItemHtml`

Extension for `micromark` that can be passed in `htmlExtensions` to support GFM
task list items when serializing to HTML
([`HtmlExtension`][micromark-html-extension]).

## Authoring

It is recommended to use lowercase `x` (instead of uppercase `X`), because in
markdown, it is more common to use lowercase in places where casing does not
matter.
It is also recommended to use a space (instead of a tab), as there is no benefit
of using tabs in this case.

## HTML

Checks relate to the `<input>` element, in the checkbox state (`type=checkbox`),
in HTML.
See [*§ 4.10.5.1.15 Checkbox state (`type=checkbox`)*][html-input-checkbox]
in the HTML spec for more info.

```html
<!--…-->
<li><input type="checkbox" disabled="" /> foo</li>
<li><input type="checkbox" disabled="" checked="" /> bar</li>
<!--…-->
```

## CSS

GitHub itself uses slightly different markup for task list items than they
define in their spec.
When following the spec, as this extension does, only inputs are added.
They can be styled with the following CSS:

```css
input[type="checkbox"] {
  margin: 0 .2em .25em -1.6em;
  vertical-align: middle;
}

input[type="checkbox"]:dir(rtl) {
  margin: 0 -1.6em .25em .2em;
}
```

For the complete actual CSS see
[`sindresorhus/github-markdown-css`][github-markdown-css].

## Syntax

Checks form with the following BNF:

```bnf
gfm_task_list_item_check ::= '[' (0x09 | ' ' | 'X' | 'x') ']'
```

The check is only allowed at the start of the first paragraph, optionally
following zero or more definitions or a blank line, in a list item.
The check must be followed by whitespace (`[\t\n\r ]*`), which is in turn
followed by non-whitespace.

## Types

This package is fully typed with [TypeScript][].
It exports no additional types.

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
*   [`mdast-util-gfm-task-list-item`][mdast-util-gfm-task-list-item]
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

[build-badge]: https://github.com/micromark/micromark-extension-gfm-task-list-item/workflows/main/badge.svg

[build]: https://github.com/micromark/micromark-extension-gfm-task-list-item/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/micromark/micromark-extension-gfm-task-list-item.svg

[coverage]: https://codecov.io/github/micromark/micromark-extension-gfm-task-list-item

[downloads-badge]: https://img.shields.io/npm/dm/micromark-extension-gfm-task-list-item.svg

[downloads]: https://www.npmjs.com/package/micromark-extension-gfm-task-list-item

[size-badge]: https://img.shields.io/bundlephobia/minzip/micromark-extension-gfm-task-list-item.svg

[size]: https://bundlephobia.com/result?p=micromark-extension-gfm-task-list-item

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/micromark/micromark/discussions

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[license]: license

[author]: https://wooorm.com

[contributing]: https://github.com/micromark/.github/blob/HEAD/contributing.md

[support]: https://github.com/micromark/.github/blob/HEAD/support.md

[coc]: https://github.com/micromark/.github/blob/HEAD/code-of-conduct.md

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[typescript]: https://www.typescriptlang.org

[development]: https://nodejs.org/api/packages.html#packages_resolving_user_conditions

[micromark]: https://github.com/micromark/micromark

[micromark-html-extension]: https://github.com/micromark/micromark#htmlextension

[micromark-extension]: https://github.com/micromark/micromark#syntaxextension

[micromark-extension-gfm]: https://github.com/micromark/micromark-extension-gfm

[mdast-util-gfm-task-list-item]: https://github.com/syntax-tree/mdast-util-gfm-task-list-item

[mdast-util-gfm]: https://github.com/syntax-tree/mdast-util-gfm

[remark-gfm]: https://github.com/remarkjs/remark-gfm

[task list items]: https://github.github.com/gfm/#task-list-items-extension-

[github-markdown-css]: https://github.com/sindresorhus/github-markdown-css

[html-input-checkbox]: https://html.spec.whatwg.org/multipage/input.html#checkbox-state-\(type=checkbox\)

[api-gfm-task-list-item]: #gfmtasklistitem

[api-gfm-task-list-item-html]: #gfmtasklistitemhtml
