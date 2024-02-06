# PostCSS HWB Function [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][postcss]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-hwb-function.svg" height="20">][npm-url]
[<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/hwb-function.svg" height="20">][css-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]


[PostCSS HWB Function] lets you use `hwb` color functions in
CSS, following the [CSS Color] specification.

```pcss
a {
	color: hwb(194 0% 0%);
	color: hwb(194 0% 0% / .5);
}

/* becomes */

a {
	color: rgb(0, 195, 255);
	color: rgba(0, 195, 255, .5);
}
```

## Usage

Add [PostCSS HWB Function] to your project:

```bash
npm install postcss @csstools/postcss-hwb-function --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssHWBFunction = require('@csstools/postcss-hwb-function');

postcss([
  postcssHWBFunction(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS HWB Function] runs in all Node environments, with special
instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- |

## Options

### preserve

The `preserve` option determines whether the original functional color notation
is preserved. By default, it is not preserved.

```js
postcssHWBFunction({ preserve: true })
```

```pcss
a {
	color: hwb(194 0% 0%);
	color: hwb(194 0% 0% / .5);
}

/* becomes */

a {
	color: rgb(0, 195, 255);
	color: hwb(194 0% 0%);
	color: rgba(0, 195, 255, .5);
	color: hwb(194 0% 0% / .5);
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#hwb-function
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-hwb-function

[CSS Color]: https://drafts.csswg.org/css-color/#the-hwb-notation
[Gulp PostCSS]: https://github.com/postcss/gulp-postcss
[Grunt PostCSS]: https://github.com/nDmitry/grunt-postcss
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Loader]: https://github.com/postcss/postcss-loader
[PostCSS HWB Function]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-hwb-function
