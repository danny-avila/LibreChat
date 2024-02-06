# PostCSS Color Function [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-color-function.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/color-function.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Color Function] lets you use the `color` function in
CSS, following the [CSS Color] specification.

```pcss
.color {
	color: color(display-p3 0.64331 0.19245 0.16771);
}

:root {
	--a-color: color(srgb 0.64331 0.19245 0.16771);
}

/* becomes */

.color {
	color: rgb(179, 35, 35);
}

:root {
	--a-color: rgb(164, 49, 43);
}
```

## Usage

Add [PostCSS Color Function] to your project:

```bash
npm install postcss @csstools/postcss-color-function --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssColorFunction = require('@csstools/postcss-color-function');

postcss([
	postcssColorFunction(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Color Function] runs in all Node environments, with special
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
postcssColorFunction({ preserve: true })
```

```pcss
.color {
	color: color(display-p3 0.64331 0.19245 0.16771);
}

:root {
	--a-color: color(srgb 0.64331 0.19245 0.16771);
}

/* becomes */

.color {
	color: rgb(179, 35, 35);
	color: color(display-p3 0.64331 0.19245 0.16771);
}

:root {
	--a-color: rgb(164, 49, 43);
}

@supports (color: color(srgb 0 0 0)) {
:root {
	--a-color: color(srgb 0.64331 0.19245 0.16771);
}
}
```

### enableProgressiveCustomProperties

The `enableProgressiveCustomProperties` option determines whether the original notation
is wrapped with `@supports` when used in Custom Properties. By default, it is enabled.

⚠️ We only recommend disabling this when you set `preserve` to `false` or if you bring your own fix for Custom Properties. See what the plugin does in its [README](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-progressive-custom-properties#readme).

```js
postcssColorFunction({ enableProgressiveCustomProperties: false })
```

```pcss
.color {
	color: color(display-p3 0.64331 0.19245 0.16771);
}

:root {
	--a-color: color(srgb 0.64331 0.19245 0.16771);
}

/* becomes */

.color {
	color: rgb(179, 35, 35);
	color: color(display-p3 0.64331 0.19245 0.16771);
}

:root {
	--a-color: rgb(164, 49, 43);
	--a-color: color(srgb 0.64331 0.19245 0.16771);
}
```

_Custom properties do not fallback to the previous declaration_

## Supported Color Spaces

```css
.color-spaces {
	color: color(a98-rgb 0.803 0.484 0.944);
	color: color(display-p3 0.8434 0.509 0.934);
	color: color(prophoto-rgb 0.759 0.493 0.898);
	color: color(rec2020 0.772 0.491 0.920);
	color: color(srgb 0.897 0.488 0.959);
	color: color(srgb-linear 0.783 0.203 0.910);
	color: color(xyz 0.560 0.377 0.904);
	color: color(xyz-d50 0.550 0.375 0.680);
	color: color(xyz-d65 0.560 0.377 0.904);
}
```

## Copyright : color conversions

This software or document includes material copied from or derived from https://github.com/w3c/csswg-drafts/tree/main/css-color-4. Copyright © 2022 W3C® (MIT, ERCIM, Keio, Beihang).

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#color-function
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-color-function

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Color Function]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-color-function
[CSS Color]: https://www.w3.org/TR/css-color-4/#funcdef-color
