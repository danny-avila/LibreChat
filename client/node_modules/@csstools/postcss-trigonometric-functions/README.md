# PostCSS Trigonometric Functions [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-trigonometric-functions.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/trigonometric-functions.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Trigonometric Functions] lets you use `sin`, `cos`, `tan`, `asin`, `acos`, `atan` and `atan2` to be able to compute trigonometric relationships following the [CSS Values 4] specification.

```pcss
.trigonometry {
	line-height: sin(pi / 4);
	line-height: cos(.125turn);
	line-height: tan(50grad);
	transform: rotate(asin(-1));
	transform: rotate(asin(sin(30deg + 1.0471967rad)));
	transform: rotate(acos(-1));
	transform: rotate(acos(cos(0 / 2 + 1 - 1)));
	transform: rotate(atan(infinity));
	transform: rotate(atan(e - 2.7182818284590452354));
	transform: rotate(atan2(-infinity,-infinity));
	transform: rotate(atan2(-infinity,infinity));
	transform: rotate(atan2(-infinity,infinity));
	transform: rotate(atan2(90, 15));
}

/* becomes */

.trigonometry {
	line-height: 0.70711;
	line-height: 0.70711;
	line-height: 1;
	transform: rotate(-90deg);
	transform: rotate(89.99995deg);
	transform: rotate(180deg);
	transform: rotate(0deg);
	transform: rotate(90deg);
	transform: rotate(0deg);
	transform: rotate(-135deg);
	transform: rotate(-45deg);
	transform: rotate(-45deg);
	transform: rotate(80.53768deg);
}
```

## Usage

Add [PostCSS Trigonometric Functions] to your project:

```bash
npm install postcss @csstools/postcss-trigonometric-functions --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssTrigonometricFunctions = require('@csstools/postcss-trigonometric-functions');

postcss([
	postcssTrigonometricFunctions(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Trigonometric Functions] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## ⚠️ About custom properties

Given the dynamic nature of custom properties it's impossible to know what the variable value is, which means the plugin can't compute a final value for the stylesheet.

Because of that, any usage that contains a `var` is skipped.

## Units

[PostCSS Trigonometric Functions] lets you use different special units that are within the spec and computed at run time to be able to calculate the result of the trigonometric function.

The following units are supported:

* `pi`: Computes to `Math.PI` which is `3.141592653589793`
* `e`: Computes to `Math.E` which is `2.718281828459045`
* `infinity`, `-infinity`: Compute to `Infinity` and `-Infinity` respectively. Note that the usage is case insensitive so `InFiNiTy` is a valid value.

Some calculations (such as `sin(-infinity)`) might return `NaN` as per the spec. Given that `NaN` can't be replaced with a value that's useful to CSS it is left as is, as the result will be effectively ignored by the browser.

## Options

### preserve

The `preserve` option determines whether the original notation
is preserved. By default, it is not preserved.

```js
postcssTrigonometricFunctions({ preserve: true })
```

```pcss
.trigonometry {
	line-height: sin(pi / 4);
	line-height: cos(.125turn);
	line-height: tan(50grad);
	transform: rotate(asin(-1));
	transform: rotate(asin(sin(30deg + 1.0471967rad)));
	transform: rotate(acos(-1));
	transform: rotate(acos(cos(0 / 2 + 1 - 1)));
	transform: rotate(atan(infinity));
	transform: rotate(atan(e - 2.7182818284590452354));
	transform: rotate(atan2(-infinity,-infinity));
	transform: rotate(atan2(-infinity,infinity));
	transform: rotate(atan2(-infinity,infinity));
	transform: rotate(atan2(90, 15));
}

/* becomes */

.trigonometry {
	line-height: 0.70711;
	line-height: sin(pi / 4);
	line-height: 0.70711;
	line-height: cos(.125turn);
	line-height: 1;
	line-height: tan(50grad);
	transform: rotate(-90deg);
	transform: rotate(asin(-1));
	transform: rotate(89.99995deg);
	transform: rotate(asin(sin(30deg + 1.0471967rad)));
	transform: rotate(180deg);
	transform: rotate(acos(-1));
	transform: rotate(0deg);
	transform: rotate(acos(cos(0 / 2 + 1 - 1)));
	transform: rotate(90deg);
	transform: rotate(atan(infinity));
	transform: rotate(0deg);
	transform: rotate(atan(e - 2.7182818284590452354));
	transform: rotate(-135deg);
	transform: rotate(atan2(-infinity,-infinity));
	transform: rotate(-45deg);
	transform: rotate(atan2(-infinity,infinity));
	transform: rotate(-45deg);
	transform: rotate(atan2(-infinity,infinity));
	transform: rotate(80.53768deg);
	transform: rotate(atan2(90, 15));
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#trigonometric-functions
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-trigonometric-functions

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Trigonometric Functions]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-trigonometric-functions
[CSS Values 4]: https://www.w3.org/TR/css-values-4/#trig-funcs
