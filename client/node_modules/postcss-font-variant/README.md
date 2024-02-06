# PostCSS Font-Variant [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">](https://github.com/postcss/postcss/)

[![CSS Status](https://cssdb.org/badge/font-variant-property.svg)](https://cssdb.org/#font-variant-property)
[![Build Status](https://travis-ci.org/postcss/postcss-font-variant.svg)](https://travis-ci.org/postcss/postcss-font-variant)

PostCSS Font-Variant lets you use `font-variant` in CSS, following the
[CSS Fonts](https://www.w3.org/TR/css-fonts-3/#font-variant-prop) specification.

## Installation

```console
$ npm install postcss-font-variant
```

## Usage

```js
// dependencies
var postcss = require("postcss")
var fontVariant = require("postcss-font-variant")

// css to be processed
var css = fs.readFileSync("input.css", "utf8")

// process css using postcss-font-variant
var out = postcss()
  .use(fontVariant())
  .process(css)
  .css
```

Using this `input.css`:

```css
h2 {
  font-variant-caps: small-caps;
}

table {
  font-variant-numeric: lining-nums;
}
```

you will get:

```css
h2 {
  font-feature-settings: "smcp";
  font-variant-caps: small-caps;
}

table {
  font-feature-settings: "lnum";
  font-variant-numeric: lining-nums;
}

```

Checkout [tests](test) for more examples.

---

## Contributing

Work on a branch, install dev-dependencies, respect coding style & run tests before submitting a bug fix or a feature.

    $ git clone https://github.com/postcss/postcss-font-variant.git
    $ git checkout -b patch-1
    $ npm install
    $ npm test

## [Changelog](CHANGELOG.md)

## [License](LICENSE)
