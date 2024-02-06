# PostCSS Color Mix Function [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-color-mix-function.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/color-mix.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Color Mix Function] lets you use the `color-mix()` function following the [CSS Color 5 Specification].

```pcss
.purple_plum {
	color: color-mix(in lch, purple 50%, plum 50%);
}

/* becomes */

.purple_plum {
	color: rgb(175, 92, 174);
}
```

## Usage

Add [PostCSS Color Mix Function] to your project:

```bash
npm install postcss @csstools/postcss-color-mix-function --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssColorMixFunction = require('@csstools/postcss-color-mix-function');

postcss([
	postcssColorMixFunction(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Color Mix Function] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## Options

### preserve

The `preserve` option determines whether the original notation
is preserved. By default, it is not preserved.

```js
postcssColorMixFunction({ preserve: true })
```

```pcss
.purple_plum {
	color: color-mix(in lch, purple 50%, plum 50%);
}

/* becomes */

.purple_plum {
	color: rgb(175, 92, 174);
	color: color-mix(in lch, purple 50%, plum 50%);
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#color-mix
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-color-mix-function

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Color Mix Function]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-color-mix-function
[CSS Color 5 Specification]: https://www.w3.org/TR/css-color-5/#color-mix
