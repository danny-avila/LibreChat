# PostCSS Logical Float And Clear [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-logical-float-and-clear.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/float-clear-logical-values.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Logical Float And Clear] lets you use logical, rather than physical, direction and dimension mappings in CSS, following the [CSS Logical Properties and Values] specification.

```pcss
.element {
	clear: inline-start;
	float: inline-end;
}

/* becomes */

.element {
	clear: left;
	float: right;
}
```

## Usage

Add [PostCSS Logical Float And Clear] to your project:

```bash
npm install postcss @csstools/postcss-logical-float-and-clear --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssLogicalFloatAndClear = require('@csstools/postcss-logical-float-and-clear');

postcss([
	postcssLogicalFloatAndClear(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Logical Float And Clear] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## Options

### inlineDirection

The `inlineDirection` option allows you to specify the direction of the inline axe. The default value is `left-to-right` respectively which would match any latin language.

You might want to tweak these value if you are using a different writing system, such as Arabic, Hebrew or Chinese for example.

```js
postcssLogicalFloatAndClear({
	inlineDirection: 'right-to-left'
})
```

```pcss
.element {
	clear: inline-start;
	float: inline-end;
}

/* becomes */

.element {
	clear: right;
	float: left;
}
```

Each direction must be one of the following:

- `top-to-bottom`
- `bottom-to-top`
- `left-to-right`
- `right-to-left`

Please do note that transformations won't run if `inlineDirection` becomes vertical.

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#float-clear-logical-values
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-logical-float-and-clear

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Logical Float And Clear]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-logical-float-and-clear
[CSS Logical Properties and Values]: https://www.w3.org/TR/css-logical-1/#float-clear
