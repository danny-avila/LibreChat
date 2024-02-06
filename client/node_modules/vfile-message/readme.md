# vfile-message

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]
[![Sponsors][sponsors-badge]][collective]
[![Backers][backers-badge]][collective]
[![Chat][chat-badge]][chat]

Create [vfile][] messages.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`VFileMessage(reason[, place][, origin])`](#vfilemessagereason-place-origin)
    *   [Well-known](#well-known)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This package provides a (lint) message format.

## When should I use this?

In most cases, you can use `file.message` from `VFile` itself, but in some
cases you might not have a file, and still want to emit warnings or errors,
in which case this can be used directly.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+ and 16.0+), install with [npm][]:

```sh
npm install vfile-message
```

In Deno with [`esm.sh`][esmsh]:

```js
import {VFileMessage} from 'https://esm.sh/vfile-message@3'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {VFileMessage} from 'https://esm.sh/vfile-message@3?bundle'
</script>
```

## Use

```js
import {VFileMessage} from 'vfile-message'

const message = new VFileMessage(
  'Unexpected unknown word `braavo`, did you mean `bravo`?',
  {line: 1, column: 8},
  'spell:typo'
)

console.log(message)
```

Yields:

```txt
[1:8: Unexpected unknown word `braavo`, did you mean `bravo`?] {
  reason: 'Unexpected unknown word `braavo`, did you mean `bravo`?',
  line: 1,
  column: 8,
  source: 'spell',
  ruleId: 'typo',
  position: {start: {line: 1, column: 8}, end: {line: null, column: null}}
}
```

## API

This package exports the identifier [`VFileMessage`][api-vfile-message].
There is no default export.

### `VFileMessage(reason[, place][, origin])`

Create a message for `reason` at `place` from `origin`.

When an error is passed in as `reason`, the `stack` is copied.

###### Parameters

*   `reason` (`string` or `Error`)
    — reason for message, uses the stack and message of the error if given
*   `place` ([`Node`][node], [`Position`][position], or [`Point`][point],
    optional)
    — place in file where the message occurred
*   `origin` (`string`, optional)
    — place in code where the message originates (example:
    `'my-package:my-rule'` or `'my-rule'`)

###### Extends

[`Error`][error].

###### Returns

Instance of `VFileMessage`.

###### Fields

*   `reason` (`string`)
    — reason for message (you should use markdown)
*   `fatal` (`boolean | null | undefined`)
    — state of problem; `true` marks associated file as no longer processable
    (error); `false` necessitates a (potential) change (warning);
    `null | undefined` for things that might not need changing (info)
*   `line` (`number | null`)
    — starting line of error
*   `column` (`number | null`)
    — starting column of error
*   `position` ([`Position | null`][position])
    — full unist position
*   `source` (`string | null`, example: `'my-package'`)
    — namespace of message
*   `ruleId` (`string | null`, example: `'my-rule'`)
    — category of message
*   `stack` (`string | null`)
    — stack of message in code
*   `file` (`string | null`)
    — path of a file (used throughout the `VFile` ecosystem)

### Well-known

It’s OK to store custom data directly on the `VFileMessage`, some of those are
handled by [utilities][util].
The following fields are documented and typed here.

###### Fields

*   `actual` (`string | null`)
    — specify the source value that’s being reported, which is deemed incorrect
*   `expected` (`Array<string> | null`)
    — suggest acceptable values that can be used instead of `actual`
*   `url` (`string | null`)
    — link to docs for the message (this must be an absolute URL that can be
    passed as `x` to `new URL(x)`)
*   `note` (`string | null`)
    — long form description of the message (you should use markdown)

## Types

This package is fully typed with [TypeScript][].
It exports no additional types.

## Compatibility

Projects maintained by the unified collective are compatible with all maintained
versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
Our projects sometimes work with older versions, but this is not guaranteed.

## Contribute

See [`contributing.md`][contributing] in [`vfile/.github`][health] for ways to
get started.
See [`support.md`][support] for ways to get help.

This project has a [code of conduct][coc].
By interacting with this repository, organization, or community you agree to
abide by its terms.

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/vfile/vfile-message/workflows/main/badge.svg

[build]: https://github.com/vfile/vfile-message/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/vfile/vfile-message.svg

[coverage]: https://codecov.io/github/vfile/vfile-message

[downloads-badge]: https://img.shields.io/npm/dm/vfile-message.svg

[downloads]: https://www.npmjs.com/package/vfile-message

[size-badge]: https://img.shields.io/bundlephobia/minzip/vfile-message.svg

[size]: https://bundlephobia.com/result?p=vfile-message

[sponsors-badge]: https://opencollective.com/unified/sponsors/badge.svg

[backers-badge]: https://opencollective.com/unified/backers/badge.svg

[collective]: https://opencollective.com/unified

[chat-badge]: https://img.shields.io/badge/chat-discussions-success.svg

[chat]: https://github.com/vfile/vfile/discussions

[npm]: https://docs.npmjs.com/cli/install

[contributing]: https://github.com/vfile/.github/blob/main/contributing.md

[support]: https://github.com/vfile/.github/blob/main/support.md

[health]: https://github.com/vfile/.github

[coc]: https://github.com/vfile/.github/blob/main/code-of-conduct.md

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[esmsh]: https://esm.sh

[typescript]: https://www.typescriptlang.org

[license]: license

[author]: https://wooorm.com

[error]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error

[node]: https://github.com/syntax-tree/unist#node

[position]: https://github.com/syntax-tree/unist#position

[point]: https://github.com/syntax-tree/unist#point

[vfile]: https://github.com/vfile/vfile

[util]: https://github.com/vfile/vfile#utilities

[api-vfile-message]: #vfilemessagereason-place-origin
