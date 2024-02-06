# PostCSS Relative Color Syntax [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-relative-color-syntax.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/relative-color-syntax.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Relative Color Syntax] lets you use the relative color syntax in CSS color functions following [CSS Color Module 5].

```pcss
.example {
	background: oklab(from oklab(54.3% -22.5% -5%) calc(1.0 - l) calc(a * 0.8) b);
}

/* becomes */

.example {
	background: rgb(12, 100, 100);
}
```

## Usage

Add [PostCSS Relative Color Syntax] to your project:

```bash
npm install postcss @csstools/postcss-relative-color-syntax --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssRelativeColorSyntax = require('@csstools/postcss-relative-color-syntax');

postcss([
	postcssRelativeColorSyntax(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Relative Color Syntax] runs in all Node environments, with special
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
postcssRelativeColorSyntax({ preserve: true })
```

```pcss
.example {
	background: oklab(from oklab(54.3% -22.5% -5%) calc(1.0 - l) calc(a * 0.8) b);
}

/* becomes */

.example {
	background: rgb(12, 100, 100);
	background: oklab(from oklab(54.3% -22.5% -5%) calc(1.0 - l) calc(a * 0.8) b);
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#relative-color-syntax
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-relative-color-syntax

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Relative Color Syntax]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-relative-color-syntax
[CSS Color Module 5]: https://www.w3.org/TR/css-color-5/#relative-colors
