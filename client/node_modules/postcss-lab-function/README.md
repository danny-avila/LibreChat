# PostCSS Lab Function [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][postcss]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-lab-function.svg" height="20">][npm-url]
[<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/lab-function.svg" height="20">][css-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]


[PostCSS Lab Function] lets you use `lab` and `lch` color functions in
CSS, following the [CSS Color] specification.

```pcss
.color-lab {
	color: lab(40% 56.6 39);
}

.color-lch {
	color: lch(40% 68.735435 34.568626);
}

/* becomes */

.color {
	color: rgb(179, 35, 35);
	color: color(display-p3 0.64331 0.19245 0.16771);
}

.color-lch {
	color: rgb(179, 35, 35);
	color: color(display-p3 0.64331 0.19245 0.16771);
}
```

## Usage

Add [PostCSS Lab Function] to your project:

```bash
npm install postcss postcss-lab-function --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssLabFunction = require('postcss-lab-function');

postcss([
  postcssLabFunction(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Lab Function] runs in all Node environments, with special
instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- |

## Options

### preserve

The `preserve` option determines whether the original functional color notation
is preserved. By default, it is not preserved.

```js
postcssLabFunction({ preserve: true })
```

```pcss
.color {
	color: lab(40% 56.6 39);
}

/* becomes */

.color {
	color: rgb(179, 35, 35);
	color: color(display-p3 0.64331 0.19245 0.16771);
	color: lab(40% 56.6 39);
}
```

### enableProgressiveCustomProperties

The `enableProgressiveCustomProperties` option determines whether the original notation
is wrapped with `@supports` when used in Custom Properties. By default, it is enabled.

⚠️ We only recommend disabling this when you set `preserve` to `false` or if you bring your own fix for Custom Properties. See what the plugin does in its [README](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-progressive-custom-properties#readme).

```js
postcssLabFunction({ enableProgressiveCustomProperties: false })
```

```pcss
:root {
	--firebrick: lab(40% 56.6 39);
}

/* becomes */

:root {
	--firebrick: rgb(178, 34, 34); /* will never be used, not even in older browser */
	--firebrick: color(display-p3 0.64331 0.19245 0.16771); /* will never be used, not even in older browser */
	--firebrick: lab(40% 56.6 39);
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
.color {
	color: lab(40% 56.6 39);
}

/* becomes */

.color {
	color: rgb(179, 35, 35);
	color: lab(40% 56.6 39);
}
```

## Copyright : color conversions

This software or document includes material copied from or derived from https://github.com/w3c/csswg-drafts/tree/main/css-color-4. Copyright © 2022 W3C® (MIT, ERCIM, Keio, Beihang).

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#lab-function
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-lab-function

[CSS Color]: https://drafts.csswg.org/css-color/#specifying-lab-lch
[Gulp PostCSS]: https://github.com/postcss/gulp-postcss
[Grunt PostCSS]: https://github.com/nDmitry/grunt-postcss
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Loader]: https://github.com/postcss/postcss-loader
[PostCSS Lab Function]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-lab-function
