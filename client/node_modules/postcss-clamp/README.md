# PostCSS Clamp
[![Build Status][ci-img]][ci] [![codecov.io][cov-img]][cov]

[PostCSS] plugin to transform `clamp()` to combination of `min/max`.

[PostCSS]:    https://github.com/postcss/postcss
[ci-img]:     https://travis-ci.com/polemius/postcss-clamp.svg?branch=master
[ci]:         https://travis-ci.com/polemius/postcss-clamp
[cov-img]: https://codecov.io/github/polemius/postcss-clamp/coverage.svg?branch=master
[cov]:        https://codecov.io/github/polemius/postcss-clamp?branch=master

This plugin transform this css:

```css
.foo {
  width: clamp(10px, 4em, 80px);
}
```

into this:

```css
.foo {
  width: max(10px, min(4em, 80px));
}
```

Or with enabled options `precalculate`:

```css
.foo {
  width: clamp(10em, 4px, 10px);
}

/* becomes */

.foo {
  width: max(10em, 14px);
}
```

[!['Can I use' table](https://caniuse.bitsofco.de/image/css-math-functions.png)](https://caniuse.com/#feat=css-math-functions)

## Instalation

```bash
$ npm install postcss postcss-clamp --save-dev
or
$ yarn add --dev postcss postcss-clamp
```

## Usage

Use [PostCSS Clamp] as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssClamp = require('postcss-clamp');

postcss([
  postcssClamp(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Clamp] runs in all Node environments, with special instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Create React App](INSTALL.md#create-react-app) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- | --- |

See [PostCSS] docs for examples for your environment.

## Options

### precalculate

The `precalculate` option determines whether values with the same unit
should be precalculated. By default, these are not precalculation.

```js
postcssColorHexAlpha({
  precalculate: true
});
```

The second and third value has the same unit (`px`):

```css
.foo {
  width: clamp(10em, 4px, 10px);
}

/* becomes */

.foo {
  width: max(10em, 14px);
}
```

Here all values have the same unit:

```css
.foo {
  width: clamp(10px, 4px, 10px);
}

/* becomes */

.foo {
  width: 24px;
}
```

## LICENSE

See [LICENSE](LICENSE)

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Clamp]: https://github.com/polemius/postcss-clamp
