# PostCSS Place Properties [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-place.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/place-properties.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Place Properties] lets you use `place-*` properties as shorthands for `align-*`
and `justify-*`, following the [CSS Box Alignment] specification.

```pcss
.example {
	place-self: center;
	place-content: space-between center;
}

/* becomes */

.example {
	align-self: center;
	justify-self: center;
	place-self: center;
	align-content: space-between;
	justify-content: center;
	place-content: space-between center;
}
```

## Usage

Add [PostCSS Place Properties] to your project:

```bash
npm install postcss postcss-place --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssPlace = require('postcss-place');

postcss([
	postcssPlace(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Place Properties] runs in all Node environments, with special
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
postcssPlace({ preserve: false })
```

```pcss
.example {
	place-self: center;
	place-content: space-between center;
}

/* becomes */

.example {
	align-self: center;
	justify-self: center;
	align-content: space-between;
	justify-content: center;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#place-properties
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-place

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Place Properties]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-place
[CSS Box Alignment]: https://www.w3.org/TR/css-align-3/#place-content
