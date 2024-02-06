# PostCSS Logical Viewport Units [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-logical-viewport-units.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/logical-viewport-units.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Logical Viewport Units] lets you easily use `vb` and `vi` length units following the [CSS-Values-4 Specification].

```pcss
.foo {
	margin: 10vi 20vb;
}

/* becomes */

.foo {
	margin: 10vw 20vh;
	margin: 10vi 20vb;
}
```

## Usage

Add [PostCSS Logical Viewport Units] to your project:

```bash
npm install postcss @csstools/postcss-logical-viewport-units --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssLogicalViewportUnits = require('@csstools/postcss-logical-viewport-units');

postcss([
	postcssLogicalViewportUnits(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Logical Viewport Units] runs in all Node environments, with special
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
 postcssLogicalViewportUnits({
 	inlineDirection: 'top-to-bottom'
 })
 ```

 ```pcss
 .foo {
	margin: 10vi 20vb;
}

 /* becomes */

 .foo {
	margin: 10vh 20vw;
	margin: 10vi 20vb;
}
 ```

 Each direction must be one of the following:

 - `top-to-bottom`
 - `bottom-to-top`
 - `left-to-right`
 - `right-to-left`

 Please do note that transformations won't do anything particular for `right-to-left` or `bottom-to-top`.

### preserve

The `preserve` option determines whether the original notation
is preserved. By default, it is preserved.

```js
postcssLogicalViewportUnits({ preserve: false })
```

```pcss
.foo {
	margin: 10vi 20vb;
}

/* becomes */

.foo {
	margin: 10vw 20vh;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#logical-viewport-units
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-logical-viewport-units

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Logical Viewport Units]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-logical-viewport-units
[CSS-Values-4 Specification]: https://www.w3.org/TR/css-values-4/#viewport-relative-units
