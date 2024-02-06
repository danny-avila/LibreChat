# PostCSS Opacity Percentage

[![Test](https://github.com/mrcgrtz/postcss-opacity-percentage/actions/workflows/test.yml/badge.svg)](https://github.com/mrcgrtz/postcss-opacity-percentage/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/mrcgrtz/postcss-opacity-percentage/badge.svg?branch=main)](https://coveralls.io/github/mrcgrtz/postcss-opacity-percentage?branch=main)
[![Install size](https://packagephobia.now.sh/badge?p=postcss-opacity-percentage)](https://packagephobia.now.sh/result?p=postcss-opacity-percentage)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![MIT license](https://img.shields.io/github/license/mrcgrtz/postcss-opacity-percentage.svg)](https://github.com/mrcgrtz/postcss-opacity-percentage/blob/main/LICENSE.md)

[PostCSS](https://github.com/postcss/postcss) plugin to transform [percentage-based opacity values](https://www.w3.org/TR/css-color-4/#transparency) to more compatible floating-point values.

## Install

Using [npm](https://www.npmjs.com/get-npm):

```bash
npm install --save-dev postcss postcss-opacity-percentage
```

Using [yarn](https://yarnpkg.com/):

```bash
yarn add --dev postcss postcss-opacity-percentage
```

## Example

```css
/* Input */
.foo {
  opacity: 45%;
}
```

```css
/* Output */
.foo {
  opacity: 0.45;
}
```

## Usage

```js
postcss([
  require('postcss-opacity-percentage'),
]);
```

See [PostCSS](https://github.com/postcss/postcss) documentation for examples for your environment.

### `postcss-preset-env`

If you are using [`postcss-preset-env@>=7.3.0`](https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-preset-env/CHANGELOG.md#730-january-31-2022), you already have this plugin installed via this package.

## Options

### `preserve`

The `preserve` option determines whether the original percentage value is preserved. By default, it is not preserved.

```js
// Keep the original notation
postcss([
  require('postcss-opacity-percentage')({preserve: true}),
]);
```

```css
/* Input */
.foo {
  opacity: 45%;
}
```

```css
/* Output */
.foo {
  opacity: 0.45;
  opacity: 45%;
}
```

## License

MIT © [Marc Görtz](https://marcgoertz.de/)
