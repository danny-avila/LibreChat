# PostCSS Gap Properties [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-gap-properties.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/gap-properties.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Gap Properties] lets you use the `gap`, `column-gap`, and `row-gap`
shorthand properties in CSS, following the [CSS Grid Layout] specification.

```pcss
.standard-grid {
	display: grid;
	gap: 20px;
}

.spaced-grid {
	display: grid;
	column-gap: 40px;
	row-gap: 20px;
}

/* becomes */

.standard-grid {
	display: grid;
	grid-gap: 20px;
	gap: 20px;
}

.spaced-grid {
	display: grid;
	grid-column-gap: 40px;
	column-gap: 40px;
	grid-row-gap: 20px;
	row-gap: 20px;
}
```

## Usage

Add [PostCSS Gap Properties] to your project:

```bash
npm install postcss postcss-gap-properties --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssGapProperties = require('postcss-gap-properties');

postcss([
	postcssGapProperties(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Gap Properties] runs in all Node environments, with special
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
is preserved. By default, it is preserved.

```js
postcssGapProperties({ preserve: false })
```

```pcss
.standard-grid {
	display: grid;
	gap: 20px;
}

.spaced-grid {
	display: grid;
	column-gap: 40px;
	row-gap: 20px;
}

/* becomes */

.standard-grid {
	display: grid;
	grid-gap: 20px;
}

.spaced-grid {
	display: grid;
	grid-column-gap: 40px;
	grid-row-gap: 20px;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#gap-properties
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-gap-properties

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Gap Properties]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-gap-properties
[CSS Grid Layout]: https://www.w3.org/TR/css-grid-1/#gutters
