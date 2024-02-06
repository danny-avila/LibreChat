# PostCSS Logical Resize [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-logical-resize.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/logical-resize.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Logical Resize] lets you use logical, rather than physical, values for `resize`, following the [CSS Logical Properties and Values] specification.

```pcss
.resize-block {
	resize: block;
}

.resize-inline {
	resize: inline;
}

/* becomes */

.resize-block {
	resize: vertical;
}

.resize-inline {
	resize: horizontal;
}
```

## Usage

Add [PostCSS Logical Resize] to your project:

```bash
npm install postcss @csstools/postcss-logical-resize --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssLogicalResize = require('@csstools/postcss-logical-resize');

postcss([
	postcssLogicalResize(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Logical Resize] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## Options

### blockDirection & inlineDirection

The `blockDirection` and `inlineDirection` options allow you to specify the direction of the block and inline axes. The default values are `top-to-bottom` and `left-to-right` respectively which would match any latin language.

You might want to tweak these values if you are using a different writing system, such as Arabic, Hebrew or Chinese for example.

```js
postcssLogicalResize({
	blockDirection: 'right-to-left',
	inlineDirection: 'top-to-bottom'
})
```

```pcss
.resize-block {
	resize: block;
}

.resize-inline {
	resize: inline;
}

/* becomes */

.resize-block {
	resize: horizontal;
}

.resize-inline {
	resize: vertical;
}
```

Each direction must be one of the following:

- `top-to-bottom`
- `bottom-to-top`
- `left-to-right`
- `right-to-left`

You can't mix two vertical directions or two horizontal directions so for example `top-to-bottom` and `right-to-left` are valid, but `top-to-bottom` and `bottom-to-top` are not.

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#logical-resize
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-logical-resize

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Logical Resize]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-logical-resize
[CSS Logical Properties and Values]: https://www.w3.org/TR/css-logical-1/
