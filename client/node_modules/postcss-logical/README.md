# PostCSS Logical Properties and Values [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-logical.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/logical-properties-and-values.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Logical Properties and Values]  lets you use logical, rather than physical, direction and dimension mappings in CSS, following the [CSS Logical Properties and Values] specification.

```pcss
.element {
	block-size: 100px;
	max-inline-size: 400px;
	inline-size: 200px;
	padding-block: 10px 20px;
	margin-inline: auto;
	border-block-width: 2px;
	border-block-style: solid;
}

/* becomes */

.element {
	height: 100px;
	max-width: 400px;
	width: 200px;
	padding-top: 10px;
	padding-bottom: 20px;
	margin-left: auto;
	margin-right: auto;
	border-top-width: 2px;
	border-bottom-width: 2px;
	border-top-style: solid;
	border-bottom-style: solid;
}
```

## Usage

Add [PostCSS Logical Properties and Values] to your project:

```bash
npm install postcss postcss-logical --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssLogical = require('postcss-logical');

postcss([
	postcssLogical(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Logical Properties and Values] runs in all Node environments, with special
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
postcssLogical({
	blockDirection: 'right-to-left',
	inlineDirection: 'top-to-bottom'
})
```

```pcss
.element {
	block-size: 100px;
	max-inline-size: 400px;
	inline-size: 200px;
	padding-block: 10px 20px;
	margin-inline: auto;
	border-block-width: 2px;
	border-block-style: solid;
}

/* becomes */

.element {
	width: 100px;
	max-height: 400px;
	height: 200px;
	padding-right: 10px;
	padding-left: 20px;
	margin-top: auto;
	margin-bottom: auto;
	border-right-width: 2px;
	border-left-width: 2px;
	border-right-style: solid;
	border-left-style: solid;
}
```

Each direction must be one of the following:

- `top-to-bottom`
- `bottom-to-top`
- `left-to-right`
- `right-to-left`

You can't mix two vertical directions or two horizontal directions so for example `top-to-bottom` and `right-to-left` are valid, but `top-to-bottom` and `bottom-to-top` are not.

Please do note that `text-align` won't be transformed if `inlineDirection` becomes vertical.

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#logical-properties-and-values
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-logical

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Logical Properties and Values]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-logical
[CSS Logical Properties and Values]: https://www.w3.org/TR/css-logical-1/
