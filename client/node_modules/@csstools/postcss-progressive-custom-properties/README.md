# PostCSS Progressive Custom Properties [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS" width="90" height="90" align="right">][postcss]

[![NPM Version][npm-img]][npm-url]
[![Build Status][cli-img]][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Progressive Custom Properties] is a utility plugin to correctly declare Custom Property fallbacks and enhancements.

⚠️ It is not intended to be used directly by stylesheet authors.
Meant to be included in other PostCSS plugins that provide CSS value transforms as fallbacks.

[Custom Properties are not discarded like regular declarations when invalid.](https://www.w3.org/TR/css-variables-1/#invalid-variables)
This makes it tricky to provide fallback values for older browsers.

The solution is to wrap Custom Property declarations in an `@supports` rule.

```pcss
:root {
	/* fallback */
	--a-color: red;
	/* progressive enhancement */
	--a-color: oklch(40% 0.234 0.39 / var(--opacity-50));
}

/* becomes */

:root {
	--a-color: red;
}

@supports (color: oklch(0% 0 0)) {
	:root {
		--a-color: oklch(40% 0.234 0.39 / var(--opacity-50));
	}
}
```

## Ignored values

`initial` and `<white space>` are ignored.

```pcss
.initial {
	--prop-1: red;
	--prop-1: initial;
}

.white-space {
	--prop-1: red;
	--prop-1:;

	--prop-2: red;
	--prop-2: ;

	--prop-3: red;
	--prop-3:    ;
}

/* remains */

.initial {
	--prop-1: red;
	--prop-1: initial;
}

.white-space {
	--prop-1: red;
	--prop-1:;

	--prop-2: red;
	--prop-2: ;

	--prop-3: red;
	--prop-3:    ;
}
```

## Usage

Add [PostCSS Progressive Custom Properties] to your project:

```bash
npm install @csstools/postcss-progressive-custom-properties --save-dev
```

Use [PostCSS Progressive Custom Properties] as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssCustomProperties = require('@csstools/postcss-progressive-custom-properties');

postcss([
  postcssProgressiveCustomProperties()
]).process(YOUR_CSS /*, processOptions */);
```

## @supports

This plugin wraps Custom Property override declarations in an `@supports` rule.
With PostCSS 8 this trigger declaration visitors to run again.

Make sure your plugin detects and ignores values inside relevant `@supports` rules.


[PostCSS Progressive Custom Properties] runs in all Node environments, with special instructions for:

| [Node](INSTALL.md#node) | [PostCSS CLI](INSTALL.md#postcss-cli) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- | --- |


[cli-img]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml/badge.svg
[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[discord]: https://discord.gg/bUadyRwkJS
[npm-img]: https://img.shields.io/npm/v/@csstools/postcss-progressive-custom-properties.svg
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-progressive-custom-properties

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Progressive Custom Properties]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-progressive-custom-properties
