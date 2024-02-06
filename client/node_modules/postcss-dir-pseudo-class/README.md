# PostCSS Dir Pseudo Class [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-dir-pseudo-class.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/dir-pseudo-class.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Dir Pseudo Class] lets you style by directionality using the `:dir()`
pseudo-class in CSS, following the [Selectors] specification.

```pcss
article h3:dir(rtl) {
	margin-right: 10px;
}

article h3:dir(ltr) {
	margin-left: 10px;
}

/* becomes */

[dir="rtl"] article h3 {
	margin-right: 10px;
}

[dir="ltr"] article h3 {
	margin-left: 10px;
}
```

### Maintaining Specificity

Using [PostCSS Dir Pseudo Class] will not impact selector weight, but it will
require having at least one `[dir]` attribute in your HTML. If you don’t have
_any_ `[dir]` attributes, consider using the following JavaScript:

```js
// force at least one dir attribute (this can run at any time)
document.documentElement.dir=document.documentElement.dir||'ltr';
```

If you absolutely cannot add a `[dir]` attribute in your HTML or even force one
via JavaScript, you can still work around this by presuming a direction in your
CSS using the [`dir` option](#dir), but understand that this will
sometimes increase selector weight by one element (`html`).

## Usage

Add [PostCSS Dir Pseudo Class] to your project:

```bash
npm install postcss postcss-dir-pseudo-class --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssDirPseudoClass = require('postcss-dir-pseudo-class');

postcss([
	postcssDirPseudoClass(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Dir Pseudo Class] runs in all Node environments, with special
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
postcssDirPseudoClass({ preserve: true })
```

```pcss
article h3:dir(rtl) {
	margin-right: 10px;
}

article h3:dir(ltr) {
	margin-left: 10px;
}

/* becomes */

[dir="rtl"] article h3 {
	margin-right: 10px;
}

article h3:dir(rtl) {
	margin-right: 10px;
}

[dir="ltr"] article h3 {
	margin-left: 10px;
}

article h3:dir(ltr) {
	margin-left: 10px;
}
```

### dir

The `dir` option allows you presume a direction in your CSS. By default, this
is not specified and you are required to include a direction `[dir]` attribute
somewhere in your HTML, preferably on the `html` element.

```js
postcssDirPseudoClass({ dir: 'ltr' });
```

```pcss
article h3:dir(rtl) {
	margin-right: 10px;
}

article h3:dir(ltr) {
	margin-left: 10px;
}

/* becomes */

[dir="rtl"] article h3 {
	margin-right: 10px;
}

html:not([dir="rtl"]) article h3 {
	margin-left: 10px;
}
```

```js
postcssDirPseudoClass({ dir: 'rtl' });
```

```pcss
article h3:dir(rtl) {
	margin-right: 10px;
}

article h3:dir(ltr) {
	margin-left: 10px;
}

/* becomes */

html:not([dir="ltr"]) article h3 {
	margin-right: 10px;
}

[dir="ltr"] article h3 {
	margin-left: 10px;
}
```

### shadow

The `shadow` option determines whether the CSS is assumed to be used in Shadow DOM with Custom Elements.

```js
postcssDirPseudoClass({ shadow: true })
```

```pcss
article h3:dir(rtl) {
	margin-right: 10px;
}

article h3:dir(ltr) {
	margin-left: 10px;
}

/* becomes */

:host-context([dir="rtl"]) article h3 {
	margin-right: 10px;
}

:host-context([dir="ltr"]) article h3 {
	margin-left: 10px;
}
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#dir-pseudo-class
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/postcss-dir-pseudo-class

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Dir Pseudo Class]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-dir-pseudo-class
[Selectors]: https://www.w3.org/TR/selectors-4/#the-dir-pseudo
