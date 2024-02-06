# PostCSS Normalize Display Values [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][postcss]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-normalize-display-values.svg" height="20">][npm-url]
[<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/display-two-values.svg" height="20">][css-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Normalize Display Values] lets you specify definition of outer and inner displays types for an element.

```pcss
.element {
  display: inline flow-root;
}

/* becomes */

.element {
  display: inline-block;
  display: inline flow-root;
}
```

_See prior work by [cssnano](https://github.com/cssnano) here [postcss-normalize-display-values](https://github.com/cssnano/cssnano/tree/master/packages/postcss-normalize-display-values)
To ensure long term maintenance and to provide the needed features this plugin was recreated based on cssnano's work._

## Usage

Add [PostCSS Normalize Display Values] to your project:

```bash
npm install postcss @csstools/postcss-normalize-display-values --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssNormalizeDisplayValues = require('@csstools/postcss-normalize-display-values');

postcss([
  postcssNormalizeDisplayValues(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Normalize Display Values] runs in all Node environments, with special
instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- |

## Options

### preserve

The `preserve` option determines whether the original source
is preserved. By default, it is preserved.

```js
postcssNormalizeDisplayValues({ preserve: false })
```

```pcss
.element {
  display: inline flow-root;
}

/* becomes */

.element {
  display: inline-block; 
}
```

[postcss]: https://github.com/postcss/postcss

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#display-two-values
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-normalize-display-values

[CSS Fonts]: https://www.w3.org/TR/css-display-3/#the-display-properties
[Gulp PostCSS]: https://github.com/postcss/gulp-postcss
[Grunt PostCSS]: https://github.com/nDmitry/grunt-postcss
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Loader]: https://github.com/postcss/postcss-loader
[PostCSS Normalize Display Values]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-normalize-display-values
