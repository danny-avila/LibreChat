# PostCSS Color Hex Alpha [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-color-hex-alpha.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/hexadecimal-alpha-notation.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

```bash
npm install postcss-color-hex-alpha --save-dev
```

[PostCSS Color Hex Alpha] lets you use 4 & 8 character hex color notation in
CSS, following the [CSS Color Module] specification.

```pcss
body {
	background: #9d9c;
}

/* becomes */

body {
	background: rgba(153,221,153,0.8);
}
```

## Usage

Add [PostCSS Color Hex Alpha] to your project:

```bash
npm install postcss postcss-color-hex-alpha --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssColorHexAlpha = require('postcss-color-hex-alpha');

postcss([
	postcssColorHexAlpha(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Color Hex Alpha] runs in all Node environments, with special
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
postcssColorHexAlpha({ preserve: true })
```

```pcss
body {
	background: #9d9c;
}

/* becomes */

body {
	background: rgba(153,221,153,0.8);
	background: #9d9c;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#hexadecimal-alpha-notation
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-color-hex-alpha

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Color Hex Alpha]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-color-hex-alpha
[CSS Color Module]: https://www.w3.org/TR/css-color-4/#hex-notation
