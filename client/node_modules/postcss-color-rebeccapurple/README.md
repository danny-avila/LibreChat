# PostCSS RebeccaPurple [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-color-rebeccapurple.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/rebeccapurple-color.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS RebeccaPurple] lets you use the `rebeccapurple` color keyword in CSS.

```pcss
.heading {
	color: rebeccapurple;
}

/* becomes */

.heading {
	color: #639;
}
```

## About the `rebeccapurple` keyword

In 2014, Rebecca Alison Meyer, the daughter of [Eric A. Meyer](https://en.wikipedia.org/wiki/Eric_A._Meyer), an American web design consultant best known for his advocacy work on behalf of CSS, passed away of a brain tumor at six years of age.

In her memory, the hex color `#663399` is named `rebeccapurple` and [added to the CSS Colors list](https://lists.w3.org/Archives/Public/www-style/2014Jun/0312.html).

## Usage

Add [PostCSS RebeccaPurple] to your project:

```bash
npm install postcss postcss-color-rebeccapurple --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssRebeccaPurple = require('postcss-color-rebeccapurple');

postcss([
	postcssRebeccaPurple(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS RebeccaPurple] runs in all Node environments, with special
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
postcssRebeccaPurple({ preserve: true })
```

```pcss
.heading {
	color: rebeccapurple;
}

/* becomes */

.heading {
	color: #639;
	color: rebeccapurple;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#rebeccapurple-color
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-color-rebeccapurple

[PostCSS]: https://github.com/postcss/postcss
[PostCSS RebeccaPurple]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-color-rebeccapurple
