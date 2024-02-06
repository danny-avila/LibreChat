# PostCSS Custom Media [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-custom-media.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/custom-media-queries.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Custom Media] lets you define `@custom-media` in CSS following the [Custom Media Specification].

```pcss
@custom-media --small-viewport (max-width: 30em);

@media (--small-viewport) {
	/* styles for small viewport */
}

/* becomes */

@media (max-width: 30em) {
	/* styles for small viewport */
}
```

## `true` and `false`

With `@custom-media` you can use the constants `true` and `false`.
These are especially handy when debugging.

If you are unsure how your page is affected when a certain media query matches or not you can use these, to quickly toggle the results.
This plugin downgrades these queries to something that works in all browsers.

Quickly check the result as if the query matches:

```pcss
@custom-media --small-viewport true;

@media (--small-viewport) {
	/* styles for small viewport */
}

/* becomes */

@media (max-color:2147477350) {
	/* styles for small viewport */
}
```

Quickly check the result as if the query does not match:

```pcss
@custom-media --small-viewport false;

@media (--small-viewport) {
	/* styles for small viewport */
}

/* becomes */

@media (color:2147477350) {
	/* styles for small viewport */
}
```

## logical evaluation of complex media queries

It is impossible to accurately and correctly resolve complex `@custom-media` queries
as these depend on the browser the queries will eventually run in.

_Some of these queries will have only one possible outcome but we have to account for all possible queries in this plugin._

⚠️ When handling complex media queries you will see that your CSS is doubled for each level of complexity.<br>
GZIP works great to de-dupe this but having a lot of complex media queries will have a performance impact.

An example of a very complex (and artificial) use-case :

```pcss

@custom-media --a-complex-query tty and (min-width: 300px);

@media not screen and ((not (--a-complex-query)) or (color)) {
	/* Your CSS */
}

/* becomes */


@media tty and (min-width: 300px) {
@media not screen and ((not (max-color:2147477350)) or (color)) {
	/* Your CSS */
}
}
@media not  tty and (min-width: 300px) {
@media not screen and ((not (color:2147477350)) or (color)) {
	/* Your CSS */
}
}
```

## Usage

Add [PostCSS Custom Media] to your project:

```bash
npm install postcss postcss-custom-media --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssCustomMedia = require('postcss-custom-media');

postcss([
	postcssCustomMedia(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Custom Media] runs in all Node environments, with special
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
postcssCustomMedia({ preserve: true })
```

```pcss
@custom-media --small-viewport (max-width: 30em);

@media (--small-viewport) {
	/* styles for small viewport */
}

/* becomes */

@custom-media --small-viewport (max-width: 30em);

@media (max-width: 30em) {
	/* styles for small viewport */
}

@media (--small-viewport) {
	/* styles for small viewport */
}
```

## Modular CSS Processing

If you're using Modular CSS such as, CSS Modules, `postcss-loader` or `vanilla-extract` to name a few, you'll probably 
notice that custom media queries are not being resolved. This happens because each file is processed separately so 
unless you import the custom media query definitions in each file, they won't be resolved.

To overcome this, we recommend using the [PostCSS Global Data](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-global-data#readme)
plugin which allows you to pass a list of files that will be globally available. The plugin won't inject any extra code
in the output but will provide the context needed to resolve custom media queries.

For it to run it needs to be placed before the [PostCSS Custom Media] plugin.

```js
const postcss = require('postcss');
const postcssCustomMedia = require('postcss-custom-media');
const postcssGlobalData = require('@csstools/postcss-global-data');

postcss([
	postcssGlobalData({
		files: [
			'path/to/your/custom-media-queries.css'
		]
	}),
	postcssCustomMedia(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#custom-media-queries
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-custom-media

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Custom Media]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-custom-media
[Custom Media Specification]: https://www.w3.org/TR/mediaqueries-5/#at-ruledef-custom-media
