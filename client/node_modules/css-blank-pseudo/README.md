# PostCSS Blank Pseudo [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/css-blank-pseudo.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/blank-pseudo-class.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Blank Pseudo] lets you style form elements when they are empty, following 
the [Selectors Level 4] specification.

```pcss
input:blank {
	background-color: yellow;
}

/* becomes */

input[blank].js-blank-pseudo, .js-blank-pseudo input[blank] {
	background-color: yellow;
}
input:blank {
	background-color: yellow;
}
```

## Usage

Add [PostCSS Blank Pseudo] to your project:

```bash
npm install postcss css-blank-pseudo --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssBlankPseudo = require('css-blank-pseudo');

postcss([
	postcssBlankPseudo(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Blank Pseudo] runs in all Node environments, with special
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
is preserved. By default, it is preserved.

```js
postcssBlankPseudo({ preserve: false })
```

```pcss
input:blank {
	background-color: yellow;
}

/* becomes */

input[blank].js-blank-pseudo, .js-blank-pseudo input[blank] {
	background-color: yellow;
}
```

### replaceWith

The `replaceWith` option determines the selector to use when replacing
the `:blank` pseudo. By default is `[blank]`

```js
postcssBlankPseudo({ replaceWith: '.css-blank' })
```

```pcss
input:blank {
	background-color: yellow;
}

/* becomes */

.foo {
	color: blue;
	color: red;
}

.baz {
	color: green;
}
```

Note that changing this option implies that it needs to be passed to the
browser polyfill as well.

### disablePolyfillReadyClass

The `disablePolyfillReadyClass` option determines if selectors are prefixed with an indicator class.
This class is only set on your document if the polyfill loads and is needed.

By default this option is `false`.
Set this to `true` to prevent the class from being added.

```js
postcssBlankPseudo({ disablePolyfillReadyClass: true })
```

```pcss
input:blank {
	background-color: yellow;
}

/* becomes */

input[blank] {
	background-color: yellow;
}
input:blank {
	background-color: yellow;
}
```

## Browser

```js
import cssBlankPseudoInit from 'css-blank-pseudo/browser';

cssBlankPseudoInit();
```

or

```html
<!-- When using a CDN url you will have to manually update the version number -->
<script src="https://unpkg.com/css-blank-pseudo@5.0.2/dist/browser-global.js"></script>
<script>cssBlankPseudoInit()</script>
```

[PostCSS Blank Pseudo] works in all major browsers, including Safari 6+ and
Internet Explorer 9+ without any additional polyfills.

This plugin conditionally uses `MutationObserver` to ensure recently inserted 
inputs get correct styling upon insertion. If you intend to rely on that 
behaviour for browsers that do not support `MutationObserver`, you have two
options:

1. Polyfill `MutationObserver`. As long as it runs before `cssBlankPseudoInit`,
the polyfill will work.
2. If you don't want to polyfill `MutationObserver` you can also manually fire
a `change` event upon insertion so they're automatically inspected by the
polyfill.

### Browser Usage

#### force

The `force` option determines whether the library runs even if the browser 
supports the selector or not. By default, it won't run if the browser does
support the selector.

```js
cssBlankPseudoInit({ force: true });
```

#### replaceWith

Similar to the option for the PostCSS Plugin, `replaceWith` determines the
attribute or class to apply to an element when it's considered to be `:blank`.

```js
cssBlankPseudoInit({ replaceWith: '.css-blank' });
```

This option should be used if it was changed at PostCSS configuration level.
Please note that using a class, leverages `classList` under the hood which 
might  not be supported on some old browsers such as IE9, so you may need 
to polyfill `classList` in those cases.

### Using with Next.js

Given that Next.js imports packages both on the browser and on the server, you need to make sure that the package is only imported on the browser.

As outlined in the [Next.js documentation](https://nextjs.org/docs/advanced-features/dynamic-import#with-external-libraries), you need to load the package with a dynamic import:

```jsx
useEffect(async () => {
	const cssBlankPseudoInit = (await import('css-blank-pseudo/browser')).default;
	cssBlankPseudoInit();
}, []);
```

We recommend you load the polyfill as high up on your Next application as possible, such as your `pages/_app.ts` file.

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#blank-pseudo-class
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/css-blank-pseudo

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Blank Pseudo]: https://github.com/csstools/postcss-plugins/tree/main/plugins/css-blank-pseudo
[Selectors Level 4]: https://www.w3.org/TR/selectors-4/#blank
