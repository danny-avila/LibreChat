# PostCSS Nesting [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-nesting.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/nesting-rules.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Nesting] lets you nest style rules inside each other, following the [CSS Nesting specification].

If you want nested rules the same way [Sass] works
you might want to use [PostCSS Nested] instead.

```pcss
.foo {
	color: red;

	&:hover {
		color: green;
	}

	> .bar {
		color: blue;
	}

	@media (prefers-color-scheme: dark) {
		color: cyan;
	}
}

/* becomes */

.foo {
	color: red;
}
.foo:hover {
		color: green;
	}
.foo > .bar {
		color: blue;
	}
@media (prefers-color-scheme: dark) {
	.foo {
		color: cyan;
}
	}
```

## Usage

Add [PostCSS Nesting] to your project:

```bash
npm install postcss postcss-nesting --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssNesting = require('postcss-nesting');

postcss([
	postcssNesting(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Nesting] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## ⚠️ `@nest` has been removed from the specification.

Previous iterations of the [CSS Nesting specification] required using `@nest` for certain selectors.

`@nest` was removed from the specification completely.
Future versions of this plugin will error if you use `@nest`.

We advice everyone to migrate their codebase **now** to nested CSS without `@nest`.  
We published a [Stylelint Plugin](https://github.com/csstools/postcss-plugins/tree/main/plugins-stylelint/no-at-nest-rule#csstoolsstylelint-no-at-nest-rule) to help you migrate.

example warning:
> `@nest` was removed from the CSS Nesting specification and will be removed from PostCSS Nesting in the next major version.
> Change `@nest foo & {}` to `foo & {}` to migrate to the latest standard.

You can silence this warning with a new `silenceAtNestWarning` plugin option.

```js
postcssNesting({
	silenceAtNestWarning: true
})
```

## Options

### noIsPseudoSelector

#### Specificity

Before :

```css
#alpha,
.beta {
	&:hover {
		order: 1;
	}
}
```

After **without** the option :

```js
postcssNesting()
```

```css
:is(#alpha,.beta):hover {
	order: 1;
}
```

_`.beta:hover` has specificity as if `.beta` where an id selector, matching the specification._

[specificity: 1, 1, 0](https://polypane.app/css-specificity-calculator/#selector=%3Ais(%23alpha%2C.beta)%3Ahover)

After **with** the option :

```js
postcssNesting({
	noIsPseudoSelector: true
})
```

```css
#alpha:hover, .beta:hover {
	order: 1;
}
```

_`.beta:hover` has specificity as if `.beta` where a class selector, conflicting with the specification._

[specificity: 0, 2, 0](https://polypane.app/css-specificity-calculator/#selector=.beta%3Ahover)


#### Complex selectors

Before :

```css
.alpha > .beta {
	& + & {
		order: 2;
	}
}
```

After **without** the option :

```js
postcssNesting()
```

```css
:is(.alpha > .beta) + :is(.alpha > .beta) {
	order: 2;
}
```

After **with** the option :

```js
postcssNesting({
	noIsPseudoSelector: true
})
```

```css
.alpha > .beta + .alpha > .beta {
	order: 2;
}
```

_this is a different selector than expected as `.beta + .alpha` matches `.beta` followed by `.alpha`._<br>
_avoid these cases when you disable `:is()`_<br>
_writing the selector without nesting is advised here_

```css
/* without nesting */
.alpha > .beta + .beta {
	order: 2;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#nesting-rules
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-nesting

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Nesting]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-nesting
[PostCSS Nested]: https://github.com/postcss/postcss-nested
[Sass]: https://sass-lang.com/
[CSS Nesting specification]: https://www.w3.org/TR/css-nesting-1/
