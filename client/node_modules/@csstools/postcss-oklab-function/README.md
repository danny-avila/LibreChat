# PostCSS OKLab Function [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][postcss]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-oklab-function.svg" height="20">][npm-url]
[<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/oklab-function.svg" height="20">][css-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS OKLab Function] lets you use `oklab` and `oklch` color functions in
CSS, following the [CSS Color] specification.

```pcss
.test-oklab {
	color: oklab(40% 0.001236 0.0039);
}

.test-oklch {
	color: oklch(40% 0.268735435 34.568626);
}

/* becomes */

.test-oklab {
	color: rgb(73, 71, 69);
	color: color(display-p3 0.28515 0.27983 0.27246);
}

.test-oklch {
	color: rgb(131, 28, 0);
	color: color(display-p3 0.49163 0.11178 0.00000);
}
```

## Usage

Add [PostCSS OKLab Function] to your project:

```bash
npm install postcss @csstools/postcss-oklab-function --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssOKLabFunction = require('@csstools/postcss-oklab-function');

postcss([
  postcssOKLabFunction(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS OKLab Function] runs in all Node environments, with special
instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- |

## Options

### preserve

The `preserve` option determines whether the original notation
is preserved. By default, it is not preserved.

```js
postcssOKLabFunction({ preserve: true })
```

```pcss
.test-oklab {
	color: oklab(40% 0.001236 0.0039);
}

.test-oklch {
	color: oklch(40% 0.268735435 34.568626);
}

/* becomes */

.test-oklab {
	color: rgb(73, 71, 69);
	color: color(display-p3 0.28515 0.27983 0.27246);
	color: oklab(40% 0.001236 0.0039);
}

.test-oklch {
	color: rgb(131, 28, 0);
	color: color(display-p3 0.49163 0.11178 0.00000);
	color: oklch(40% 0.268735435 34.568626);
}
```

### enableProgressiveCustomProperties

The `enableProgressiveCustomProperties` option determines whether the original notation
is wrapped with `@supports` when used in Custom Properties. By default, it is enabled.

⚠️ We only recommend disabling this when you set `preserve` to `false` or if you bring your own fix for Custom Properties. See what the plugin does in its [README](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-progressive-custom-properties#readme).

```js
postcssOKLabFunction({ enableProgressiveCustomProperties: false })
```

```pcss
:root {
	--firebrick: oklab(40% 0.234 0.39);
}

/* becomes */

:root {
	--firebrick: rgb(133, 0, 67); /* will never be used, not even in older browser */
	--firebrick: color(display-p3 0.49890 0.00000 0.25954); /* will never be used, not even in older browser */
	--firebrick: oklab(40% 0.234 0.39);
}
```

### subFeatures

#### displayP3

The `subFeatures.displayP3` option determines if `color(display-p3 ...)` is used as a fallback.<br>
By default, it is enabled.

`display-p3` can display wider gamut colors than `rgb` on some devices.

```js
postcssOKLabFunction({
	subFeatures: {
		displayP3: false
	}
})
```

```pcss
.test-oklab {
	color: oklab(40% 0.001236 0.0039);
}

.test-oklch {
	color: oklch(40% 0.268735435 34.568626);
}

/* becomes */

.test-oklab {
	color: rgb(73, 71, 69);
}

.test-oklch {
	color: rgb(131, 28, 0);
}
```

## Copyright : color conversions

This software or document includes material copied from or derived from https://github.com/w3c/csswg-drafts/tree/main/css-color-4. Copyright © 2022 W3C® (MIT, ERCIM, Keio, Beihang).

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#oklab-function
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-oklab-function

[CSS Color]: https://www.w3.org/TR/css-color-4/#specifying-oklab-oklch
[Gulp PostCSS]: https://github.com/postcss/gulp-postcss
[Grunt PostCSS]: https://github.com/nDmitry/grunt-postcss
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Loader]: https://github.com/postcss/postcss-loader
[PostCSS OKLab Function]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-oklab-function
