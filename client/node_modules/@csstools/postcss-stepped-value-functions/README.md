# PostCSS Stepped Value Functions [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-stepped-value-functions.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/stepped-value-functions.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Stepped Value Functions] lets you use `round`, `rem` and `mod` stepped value functions, following the [CSS Values 4].

```pcss
.test-functions {
	padding: 8px mod(18px, 5px) 1px calc(rem(15px, 6px) + 50%);
	transform: rotate(mod(-140deg, -90deg));
	top: round(15px, 4px);
	right: round(nearest, 15px, 4px);
	bottom: round(up, 15px, 7px);
	left: round(down, 15px, 4px);
	width: round(to-zero, 15px, 4px);
}

/* becomes */

.test-functions {
	padding: 8px 3px 1px calc(3px + 50%);
	transform: rotate(-50deg);
	top: 16px;
	right: 16px;
	bottom: 21px;
	left: 12px;
	width: 12px;
}
```

## Usage

Add [PostCSS Stepped Value Functions] to your project:

```bash
npm install postcss @csstools/postcss-stepped-value-functions --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssSteppedValueFunctions = require('@csstools/postcss-stepped-value-functions');

postcss([
	postcssSteppedValueFunctions(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Stepped Value Functions] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## ⚠️ About custom properties

Given the dynamic nature of custom properties it's impossible to know what the variable value is, which means the plugin can't compute a final value for the stylesheet. 

Because of that, any usage that contains a `var` is skipped.

## Options

### preserve

The `preserve` option determines whether the original notation
is preserved. By default, it is not preserved.

```js
postcssSteppedValueFunctions({ preserve: true })
```

```pcss
.test-functions {
	padding: 8px mod(18px, 5px) 1px calc(rem(15px, 6px) + 50%);
	transform: rotate(mod(-140deg, -90deg));
	top: round(15px, 4px);
	right: round(nearest, 15px, 4px);
	bottom: round(up, 15px, 7px);
	left: round(down, 15px, 4px);
	width: round(to-zero, 15px, 4px);
}

/* becomes */

.test-functions {
	padding: 8px 3px 1px calc(3px + 50%);
	padding: 8px mod(18px, 5px) 1px calc(rem(15px, 6px) + 50%);
	transform: rotate(-50deg);
	transform: rotate(mod(-140deg, -90deg));
	top: 16px;
	top: round(15px, 4px);
	right: 16px;
	right: round(nearest, 15px, 4px);
	bottom: 21px;
	bottom: round(up, 15px, 7px);
	left: 12px;
	left: round(down, 15px, 4px);
	width: 12px;
	width: round(to-zero, 15px, 4px);
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#stepped-value-functions
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-stepped-value-functions

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Stepped Value Functions]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-stepped-value-functions
[CSS Values 4]: https://www.w3.org/TR/css-values-4/#round-func
