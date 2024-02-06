# PostCSS Unset Value [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][postcss]


[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-unset-value.svg" height="20">][npm-url]
[<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/unset-value.svg" height="20">][css-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Unset Value] lets you use the unset keyword, following the [CSS Cascading and Inheritance] specification.

```pcss
.color {
	color: unset;
}

.border-color {
	border-color: unset;
}

.margin {
	margin: unset;
}


/* becomes */
.color {
	color: inherit;
}

.border-color {
	border-color: initial;
}

.margin {
	margin: initial;
}
```

## Usage

Add [PostCSS Unset Value] to your project:

```bash
npm install postcss @csstools/postcss-unset-value --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssUnsetValue = require('@csstools/postcss-unset-value');

postcss([
  postcssUnsetValue(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Unset Value] runs in all Node environments, with special
instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- |

## Options

### preserve

The `preserve` option determines whether the original source
is preserved. By default, it is not preserved.

```js
postcssUnsetValue({ preserve: true })
```

```pcss
.color {
	color: unset;
}

.border-color {
	border-color: unset;
}

.margin {
	margin: unset;
}

/* becomes */

.color {
	color: inherit;
	color: unset;
}

.border-color {
	border-color: initial;
	border-color: unset;
}

.margin {
	margin: initial;
	margin: unset;
}
```

[postcss]: https://github.com/postcss/postcss

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#unset-value
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-unset-value

[Gulp PostCSS]: https://github.com/postcss/gulp-postcss
[Grunt PostCSS]: https://github.com/nDmitry/grunt-postcss
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Loader]: https://github.com/postcss/postcss-loader
[CSS Cascading and Inheritance]: https://www.w3.org/TR/css-cascade-4/#inherit-initial
[PostCSS Unset Value]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-unset-value
