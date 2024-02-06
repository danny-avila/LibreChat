# PostCSS Media MinMax [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-media-minmax.svg" height="20">][npm-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]<br><br>[<img alt="Baseline Status" src="https://cssdb.org/images/badges-baseline/media-query-ranges.svg" height="20">][css-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/media-query-ranges.svg" height="20">][css-url] 

```bash
npm install @csstools/postcss-media-minmax --save-dev
```

[PostCSS Media MinMax] lets you use the range notation in media queries following the [Media Queries 4 Specification].

```pcss
@media screen and (width >=500px) and (width <=1200px) {
	.bar {
		display: block;
	}
}

/* becomes */

@media screen and (min-width:500px) and (max-width:1200px) {
	.bar {
		display: block;
	}
}
```

## Usage

Add [PostCSS Media MinMax] to your project:

```bash
npm install postcss @csstools/postcss-media-minmax --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssMediaMinMax = require('@csstools/postcss-media-minmax');

postcss([
	postcssMediaMinMax(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Media MinMax] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

_See prior work by [yisibl](https://github.com/yisibl) here [postcss-media-minmax](https://github.com/postcss/postcss-media-minmax)
To ensure long term maintenance and to provide the needed features this plugin was recreated based on yisibl's work._

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#media-query-ranges
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-media-minmax

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Media MinMax]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-media-minmax
[Media Queries 4 Specification]: https://www.w3.org/TR/mediaqueries-4/#mq-features
