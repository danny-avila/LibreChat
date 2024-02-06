# PostCSS Nested Calc [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-nested-calc.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/nested-calc.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Nested Calc] lets you use nested `calc()` expressions following the [CSS Values and Units 4 specification].

```pcss
.example {
	order: calc(1 + calc(2 * 2));
}

/* becomes */

.example {
	order: calc(1 + (2 * 2));
	order: calc(1 + calc(2 * 2));
}
```

## Usage

Add [PostCSS Nested Calc] to your project:

```bash
npm install postcss @csstools/postcss-nested-calc --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssNestedCalc = require('@csstools/postcss-nested-calc');

postcss([
	postcssNestedCalc(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Nested Calc] runs in all Node environments, with special
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
is preserved. By default the original values are preserved.

```js
postcssNestedCalc({ preserve: false })
```

```pcss
.example {
	order: calc(1 + calc(2 * 2));
}

/* becomes */

.example {
	order: calc(1 + (2 * 2));
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#nested-calc
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-nested-calc

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Nested Calc]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-nested-calc
[CSS Values and Units 4 specification]: https://www.w3.org/TR/css-values/#calc-func
