# PostCSS Custom Selectors [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-custom-selectors.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/custom-selectors.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

```bash
npm install postcss-custom-selectors --save-dev
```

[PostCSS Custom Selectors] lets you define `@custom-selector` in CSS following the [Custom Selectors Specification].

```pcss
@custom-selector :--heading h1, h2, h3;

article :--heading + p {
	margin-top: 0;
}

/* becomes */

article :is(h1, h2, h3) + p {
	margin-top: 0;
}
```

## Usage

Add [PostCSS Custom Selectors] to your project:

```bash
npm install postcss postcss-custom-selectors --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssCustomSelectors = require('postcss-custom-selectors');

postcss([
	postcssCustomSelectors(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Custom Selectors] runs in all Node environments, with special
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
postcssCustomSelectors({ preserve: true })
```

```pcss
@custom-selector :--heading h1, h2, h3;

article :--heading + p {
	margin-top: 0;
}

/* becomes */

@custom-selector :--heading h1, h2, h3;

article :is(h1, h2, h3) + p {
	margin-top: 0;
}

article :--heading + p {
	margin-top: 0;
}
```

## Modular CSS Processing

If you're using Modular CSS such as, CSS Modules, `postcss-loader` or `vanilla-extract` to name a few, you'll probably
notice that custom selectors are not being resolved. This happens because each file is processed separately so
unless you import the custom selector definitions in each file, they won't be resolved.

To overcome this, we recommend using the [PostCSS Global Data](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-global-data#readme)
plugin which allows you to pass a list of files that will be globally available. The plugin won't inject any extra code
in the output but will provide the context needed to resolve custom selectors.

For it to run it needs to be placed before the [PostCSS Custom Selectors] plugin.

```js
const postcss = require('postcss');
const postcssCustomSelectors = require('postcss-custom-selectors');
const postcssGlobalData = require('@csstools/postcss-global-data');

postcss([
	postcssGlobalData({
		files: [
			'path/to/your/custom-selectors.css'
		]
	}),
	postcssCustomSelectors(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#custom-selectors
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-custom-selectors

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Custom Selectors]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-custom-selectors
[Custom Selectors Specification]: https://drafts.csswg.org/css-extensions/#custom-selectors
