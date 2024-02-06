# PostCSS IC Unit [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][postcss]


[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-ic-unit.svg" height="20">][npm-url]
[<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/ic-unit.svg" height="20">][css-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS IC Unit] lets you use the ic length unit, following the [CSS Values and Units Module] specification.

```pcss
p {
  text-indent: 2ic;
}

.bubble {
  width: calc(8ic + 20px);
}

/* becomes */
p {
  text-indent: 2em;
}

.bubble {
  width: calc(8em + 20px);
}
```

_See prior work by [JLHwung](https://github.com/JLHwung) here [postcss-ic-unit](https://github.com/JLHwung/postcss-ic-unit)
To ensure long term maintenance and to provide the needed features this plugin was recreated based on JLHwung's work._

## Usage

Add [PostCSS IC Unit] to your project:

```bash
npm install postcss @csstools/postcss-ic-unit --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssIcUnit = require('@csstools/postcss-ic-unit');

postcss([
  postcssIcUnit(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS IC Unit] runs in all Node environments, with special
instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- |

## Options

### preserve

The `preserve` option determines whether the original source
is preserved. By default, it is not preserved.

```js
postcssIcUnit({ preserve: true })
```

```pcss
p {
  text-indent: 2ic;
}

/* becomes */

p {
  text-indent: 2em;
  text-indent: 2ic;
}
```

[postcss]: https://github.com/postcss/postcss

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#ic-unit
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-ic-unit

[Gulp PostCSS]: https://github.com/postcss/gulp-postcss
[Grunt PostCSS]: https://github.com/nDmitry/grunt-postcss
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Loader]: https://github.com/postcss/postcss-loader
[CSS Values and Units Module]: https://www.w3.org/TR/css-values-4/#ic
[PostCSS IC Unit]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-ic-unit
