# PostCSS Text Decoration Shorthand [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-text-decoration-shorthand.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/text-decoration-shorthand.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Text Decoration Shorthand] lets you use `text-decoration` as a shorthand following the [Text Decoration Specification].

```pcss
.example {
	text-decoration: wavy underline purple 25%;
}

/* becomes */

.example {
	text-decoration: underline;
	text-decoration: underline wavy purple;
	text-decoration-thickness: calc(0.01em * 25);
	text-decoration: wavy underline purple 25%;
}
```

## Usage

Add [PostCSS Text Decoration Shorthand] to your project:

```bash
npm install postcss @csstools/postcss-text-decoration-shorthand --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssTextDecorationShorthand = require('@csstools/postcss-text-decoration-shorthand');

postcss([
	postcssTextDecorationShorthand(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Text Decoration Shorthand] runs in all Node environments, with special
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
postcssTextDecorationShorthand({ preserve: false })
```

```pcss
.example {
	text-decoration: wavy underline purple 25%;
}

/* becomes */

.example {
	text-decoration: underline;
	text-decoration: underline wavy purple;
	text-decoration-thickness: calc(0.01em * 25);
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#text-decoration-shorthand
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-text-decoration-shorthand

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Text Decoration Shorthand]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-text-decoration-shorthand
[Text Decoration Specification]: https://drafts.csswg.org/css-text-decor-4/#text-decoration-property
