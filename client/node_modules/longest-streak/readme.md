# longest-streak

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]

Get the count of the longest repeating streak of `substring` in `value`.

## Contents

*   [What is this?](#what-is-this)
*   [When should I use this?](#when-should-i-use-this)
*   [Install](#install)
*   [Use](#use)
*   [API](#api)
    *   [`longestStreak(value, substring)`](#longeststreakvalue-substring)
*   [Types](#types)
*   [Compatibility](#compatibility)
*   [Security](#security)
*   [Related](#related)
*   [Contribute](#contribute)
*   [License](#license)

## What is this?

This is a tiny package that finds the count of the longest adjacent repeating
substring.

## When should I use this?

This package is rather niche.
I use it for serializing markdown ASTs (particularly fenced code and math).

You can use [`ccount`][ccount] if you need the total count of substrings
occuring in a value.

## Install

This package is [ESM only][esm].
In Node.js (version 14.14+, 16.0+), install with [npm][]:

```sh
npm install longest-streak
```

In Deno with [`esm.sh`][esmsh]:

```js
import {longestStreak} from 'https://esm.sh/longest-streak@3'
```

In browsers with [`esm.sh`][esmsh]:

```html
<script type="module">
  import {longestStreak} from 'https://esm.sh/longest-streak@3?bundle'
</script>
```

## Use

```js
import {longestStreak} from 'longest-streak'

longestStreak('` foo `` bar `', '`') // => 2
```

## API

This package exports the identifier `longestStreak`.
There is no default export.

### `longestStreak(value, substring)`

Get the count of the longest repeating streak of `substring` in `value`.

###### Parameters

*   `value` (`string`) — content to search in
*   `substring` (`string`) — substring to look for, typically one character

###### Returns

Count of most frequent adjacent `substring`s in `value` (`number`).

## Types

This package is fully typed with [TypeScript][].
It exports no additional types.

## Compatibility

This package is at least compatible with all maintained versions of Node.js.
As of now, that is Node.js 14.14+ and 16.0+.
It also works in Deno and modern browsers.

## Security

This package is safe.

## Related

*   [`wooorm/ccount`](https://github.com/wooorm/ccount)
    — count the total number of `substring`s in `value`
*   [`wooorm/direction`](https://github.com/wooorm/direction)
    — detect directionality: left-to-right, right-to-left, or neutral

## Contribute

Yes please!
See [How to Contribute to Open Source][contribute].

## License

[MIT][license] © [Titus Wormer][author]

<!-- Definitions -->

[build-badge]: https://github.com/wooorm/longest-streak/workflows/main/badge.svg

[build]: https://github.com/wooorm/longest-streak/actions

[coverage-badge]: https://img.shields.io/codecov/c/github/wooorm/longest-streak.svg

[coverage]: https://codecov.io/github/wooorm/longest-streak

[downloads-badge]: https://img.shields.io/npm/dm/longest-streak.svg

[downloads]: https://www.npmjs.com/package/longest-streak

[size-badge]: https://img.shields.io/bundlephobia/minzip/longest-streak.svg

[size]: https://bundlephobia.com/result?p=longest-streak

[npm]: https://docs.npmjs.com/cli/install

[esmsh]: https://esm.sh

[license]: license

[author]: https://wooorm.com

[esm]: https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c

[typescript]: https://www.typescriptlang.org

[contribute]: https://opensource.guide/how-to-contribute/

[ccount]: https://github.com/wooorm/ccount
