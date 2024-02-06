# PostCSS Is Pseudo [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS" width="90" height="90" align="right">][postcss]

[![NPM Version][npm-img]][npm-url]
[![CSS Standard Status][css-img]][css-url]
[<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Is Pseudo Class] lets you use the `:is` pseudo class function, following the
[CSS Selector] specification.

```pcss
:is(input, button):is(:hover, :focus) {
	order: 1;
}
```

Becomes :

```pcss
input:hover {
	order: 1;
}
input:focus {
	order: 1;
}
button:hover {
	order: 1;
}
button:focus {
	order: 1;
}
```

## Usage

Add [PostCSS Is Pseudo Class] to your project:

```bash
npm install @csstools/postcss-is-pseudo-class --save-dev
```

Use [PostCSS Is Pseudo Class] as a [PostCSS] plugin:

```js
import postcss from 'postcss';
import postcssIsPseudoClass from '@csstools/postcss-is-pseudo-class';

postcss([
  postcssIsPseudoClass(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Is Pseudo Class] runs in all Node environments, with special instructions for:

| [Node](INSTALL.md#node) | [Webpack](INSTALL.md#webpack) | [Gulp](INSTALL.md#gulp) | [Grunt](INSTALL.md#grunt) |
| --- | --- | --- | --- |

## Options

### preserve

The `preserve` option determines whether the original notation
is preserved. By default, it is not preserved.

```js
postcss([
  postcssIsPseudoClass({ preserve: true })
]).process(YOUR_CSS /*, processOptions */);
```

```pcss
:is(input, button):is(:hover, :focus) {
	order: 1;
}
```

Becomes :

```pcss
input:hover {
	order: 1;
}
input:focus {
	order: 1;
}
button:hover {
	order: 1;
}
button:focus {
	order: 1;
}
:is(input, button):is(:hover, :focus) {
	order: 1;
}
```

### specificityMatchingName

The `specificityMatchingName` option allows you to change the selector used to adjust specificity.
The default value is `does-not-exist`.
If this is an actual class, id or tag name in your code, you will need to set a different option here.

See how `:not` is used to modify [specificity](#specificity).

```js
postcss([
  postcssIsPseudoClass({ specificityMatchingName: 'something-random' })
]).process(YOUR_CSS /*, processOptions */);
```

```pcss
:is(.button, button):hover {
	order: 7;
}
```

Becomes :

```pcss
.button:hover {
	order: 7;
}

button:not(.something-random):hover {
	order: 7;
}
```

### onComplexSelector

Warn on complex selectors in `:is` pseudo class functions.

```js
postcss([
  postcssIsPseudoClass({ onComplexSelector: 'warning' })
]).process(YOUR_CSS /*, processOptions */);
```

### onPseudoElement

Warn when pseudo elements are used in `:is` pseudo class functions.

⚠️ Pseudo elements are always invalid and will be transformed to `::-csstools-invalid-<pseudo-name>`.

```js
postcss([
  postcssIsPseudoClass({ onPseudoElement: 'warning' })
]).process(YOUR_CSS /*, processOptions */);
```

```css
:is(::after):hover {
	order: 1.0;
}

/* becomes */

::-csstools-invalid-after:hover {
	order: 1.0;
}
```

## ⚠️ Known shortcomings

### Specificity

`:is` takes the specificity of the most specific list item.
We can increase specificity with `:not` selectors, but we can't decrease it.

Converted selectors are ensured to have the same specificity as `:is` for the most important bit.
Less important bits can have higher specificity that `:is`.

Before :

[specificity: 0, 2, 0](https://polypane.app/css-specificity-calculator/#selector=%3Ais(%3Ahover%2C%20%3Afocus)%3Ais(.button%2C%20button))

```pcss
:is(:hover, :focus):is(.button, button) {
	order: 7;
}
```

After :

```pcss
/* specificity: [0, 2, 0] */
.button:hover {
	order: 7;
}

/* specificity: [0, 2, 1] */
/* last bit is higher than it should be, but middle bit matches */
button:not(.does-not-exist):hover {
	order: 7;
}

/* specificity: [0, 2, 0] */
.button:focus {
	order: 7;
}

/* specificity: [0, 2, 1] */
/* last bit is higher than it should be, but middle bit matches */
button:not(.does-not-exist):focus {
	order: 7;
}
```

### Complex selectors

Before :


```pcss
:is(.alpha > .beta) ~ :is(:focus > .beta) {
	order: 2;
}
```

After :

```pcss
.alpha > .beta ~ :focus > .beta {
	order: 2;
}
```

_this is a different selector than expected as `.beta ~ :focus` matches `.beta` followed by `:focus`._<br>
_avoid these cases._<br>
_writing the selector without `:is()` is advised here_

```pcss
/* without is */
.alpha:focus > .beta ~ .beta {
	order: 2;
}
```

If you have a specific pattern you can open an issue to discuss it.
We can detect and transform some cases but can't generalize them into a single solution that tackles all of them. 

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-img]: https://cssdb.org/images/badges/is-pseudo-class.svg
[css-url]: https://cssdb.org/#is-pseudo-class
[discord]: https://discord.gg/bUadyRwkJS
[npm-img]: https://img.shields.io/npm/v/@csstools/postcss-is-pseudo-class.svg
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-is-pseudo-class

[CSS Selector]: https://www.w3.org/TR/selectors-4/#matches
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Is Pseudo Class]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-is-pseudo-class
