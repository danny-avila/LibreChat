# PostCSS Scope Pseudo Class [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-scope-pseudo-class.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/scope-pseudo-class.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Scope Pseudo Class] lets you use the `:scope` Pseudo-class following the [Selectors 4 specification].

```pcss
:scope {
	color: green;
}

/* becomes */

:root {
	color: green;
}
```

## Usage

Add [PostCSS Scope Pseudo Class] to your project:

```bash
npm install postcss @csstools/postcss-scope-pseudo-class --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssScopePseudoClass = require('@csstools/postcss-scope-pseudo-class');

postcss([
	postcssScopePseudoClass(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Scope Pseudo Class] runs in all Node environments, with special
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
postcssScopePseudoClass({ preserve: true })
```

```pcss
:scope {
	color: green;
}

/* becomes */

:root {
	color: green;
}
:scope {
	color: green;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#scope-pseudo-class
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-scope-pseudo-class

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Scope Pseudo Class]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-scope-pseudo-class
[Selectors 4 specification]: https://www.w3.org/TR/selectors-4/#the-scope-pseudo
