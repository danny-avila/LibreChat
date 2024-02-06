# PostCSS Font Format [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][postcss]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-font-format-keywords.svg" height="20">][npm-url]
[<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/font-format-keywords.svg" height="20">][css-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Font Format Keywords] lets you specify font formats as keywords, following the [CSS Fonts] specification.

```pcss
@font-face {
  src: url(file.woff2) format(woff2);
}

/* becomes */

@font-face {
  src: url(file.woff2) format("woff2");
}
```

_See prior work by [valtlai](https://github.com/valtlai) here [postcss-font-format-keywords](https://github.com/valtlai/postcss-font-format-keywords)
To ensure long term maintenance and to provide the needed features this plugin was recreated based on valtlai's work._

## Usage

Add [PostCSS Font Format Keywords] to your project:

```bash
npm install postcss @csstools/postcss-font-format-keywords --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssFontFormatKeywords = require('@csstools/postcss-font-format-keywords');

postcss([
  postcssFontFormatKeywords(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Font Format Keywords] runs in all Node environments, with special
instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- |

## Options

### preserve

The `preserve` option determines whether the original source
is preserved. By default, it is not preserved.

```js
postcssFontFormatKeywords({ preserve: true })
```

```pcss
@font-face {
  src: url(file.woff2) format(woff2);
}

/* becomes */

@font-face {
  src: url(file.woff2) format("woff2");
  src: url(file.woff2) format(woff2);
}
```

[postcss]: https://github.com/postcss/postcss

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#font-format-keywords
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-font-format-keywords

[CSS Fonts]: https://www.w3.org/TR/css-fonts-4/#font-format-values
[Gulp PostCSS]: https://github.com/postcss/gulp-postcss
[Grunt PostCSS]: https://github.com/nDmitry/grunt-postcss
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Loader]: https://github.com/postcss/postcss-loader
[PostCSS Font Format Keywords]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-font-format-keywords
