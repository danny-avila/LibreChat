# PostCSS Has Pseudo [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/css-has-pseudo.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/has-pseudo-class.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Has Pseudo] lets you style elements relative to other elements in CSS, following the [Selectors Level 4] specification.

```pcss
.title:has(+ p) {
	margin-bottom: 1.5rem;
}

/* becomes */

.js-has-pseudo [csstools-has-1a-38-2x-38-30-2t-1m-2w-2p-37-14-17-w-34-15]:not(does-not-exist) {
	margin-bottom: 1.5rem;
}
.title:has(+ p) {
	margin-bottom: 1.5rem;
}
```

## Usage

Add [PostCSS Has Pseudo] to your project:

```bash
npm install postcss css-has-pseudo --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssHasPseudo = require('css-has-pseudo');

postcss([
	postcssHasPseudo(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Has Pseudo] runs in all Node environments, with special
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
is preserved. By default the original rules are preserved.

```js
postcssHasPseudo({ preserve: false })
```

```pcss
.title:has(+ p) {
	margin-bottom: 1.5rem;
}

/* becomes */

.js-has-pseudo [csstools-has-1a-38-2x-38-30-2t-1m-2w-2p-37-14-17-w-34-15]:not(does-not-exist) {
	margin-bottom: 1.5rem;
}
```

### specificityMatchingName

The `specificityMatchingName` option allows you to change the selector that is used to adjust specificity.
The default value is `does-not-exist`.
If this is an actual class, id or tag name in your code, you will need to set a different option here.

See how `:not` is used to modify [specificity](#specificity).

```js
postcssHasPseudo({ specificityMatchingName: 'something-random' })
```

[specificity 1, 2, 0](https://polypane.app/css-specificity-calculator/#selector=.x%3Ahas(%3E%20%23a%3Ahover))

Before :

```css
.x:has(> #a:hover) {
	order: 11;
}
```

After :

[specificity 1, 2, 0](https://polypane.app/css-specificity-calculator/#selector=%5Bcsstools-has-1a-3c-1m-2w-2p-37-14-1q-w-z-2p-1m-2w-33-3a-2t-36-15%5D%3Anot(%23does-not-exist)%3Anot(.does-not-exist))

```css
[csstools-has-1a-3c-1m-2w-2p-37-14-1q-w-z-2p-1m-2w-33-3a-2t-36-15]:not(#does-not-exist):not(.does-not-exist) {
	order: 11;
}
```

## ⚠️ Known shortcomings

### Specificity

`:has` transforms will result in at least one attribute selector with specificity `0, 1, 0`.<br>
If your selector only has tags we won't be able to match the original specificity.

Before :

[specificity 0, 0, 2](https://polypane.app/css-specificity-calculator/#selector=figure%3Ahas(%3E%20img))

```css
figure:has(> img)
```

After :

[specificity 0, 1, 2](https://polypane.app/css-specificity-calculator/#selector=%5Bcsstools-has-2u-2x-2v-39-36-2t-1m-2w-2p-37-14-1q-w-2x-31-2v-15%5D%3Anot(does-not-exist)%3Anot(does-not-exist))

```css
[csstools-has-2u-2x-2v-39-36-2t-1m-2w-2p-37-14-1q-w-2x-31-2v-15]:not(does-not-exist):not(does-not-exist)
```

### Plugin order

As selectors are encoded, this plugin (or `postcss-preset-env`) must be run after any other plugin that transforms selectors.

If other plugins are used, you need to place these in your config before `postcss-preset-env` or `css-has-pseudo`.

Please let us know if you have issues with plugins that transform selectors.
Then we can investigate and maybe fix these.

## Browser

```js
// initialize prefersColorScheme (applies the current OS color scheme, if available)
import cssHasPseudo from 'css-has-pseudo/browser';
cssHasPseudo(document);
```

or

```html
<!-- When using a CDN url you will have to manually update the version number -->
<script src="https://unpkg.com/css-has-pseudo@5.0.2/dist/browser-global.js"></script>
<script>cssHasPseudo(document)</script>
```

⚠️ Please use a versioned url, like this : `https://unpkg.com/css-has-pseudo@5.0.2/dist/browser-global.js`
Without the version, you might unexpectedly get a new major version of the library with breaking changes.

[PostCSS Has Pseudo] works in all major browsers, including
Internet Explorer 11. With a [Mutation Observer polyfill](https://github.com/webmodules/mutation-observer), the script will work
down to Internet Explorer 9.

### Browser Usage

#### hover

The `hover` option determines if `:hover` pseudo-class should be tracked.
This is disabled by default because it is an expensive operation.

```js
cssHasPseudo(document, { hover: true });
```

#### observedAttributes

The `observedAttributes` option determines which html attributes are observed.
If you do any client side modification of non-standard attributes and use these in combination with `:has()` you should add these here.

```js
cssHasPseudo(document, { observedAttributes: ['something-not-standard'] });
```

#### forcePolyfill

The `forcePolyfill` option determines if the polyfill is used even when the browser has native support.
This is needed when you set `preserve: false` in the PostCSS plugin config.

```js
cssHasPseudo(document, { forcePolyfill: true });
```

#### debug

The `debug` option determines if errors are emitted to the console in browser.
By default the polyfill will not emit errors or warnings.

```js
cssHasPseudo(document, { debug: true });
```

### Browser Dependencies

Web API's:

- [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [querySelectorAll](https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelectorAll) with support for post CSS 2.1 selectors and `:scope` selectors.

ECMA Script:

- `Array.prototype.filter`
- `Array.prototype.forEach`
- `Array.prototype.indexOf`
- `Array.prototype.join`
- `Array.prototype.map`
- `Array.prototype.splice`
- `RegExp.prototype.exec`
- `String.prototype.match`
- `String.prototype.replace`
- `String.prototype.split`

## CORS

⚠️ Applies to you if you load CSS from a different domain than the page.

In this case the CSS is treated as untrusted and will not be made available to the JavaScript polyfill.
The polyfill will not work without applying the correct configuration for CORS.

Example :

| page | css | CORS applies |
| --- | --- | --- |
| https://example.com/ | https://example.com/style.css | no |
| https://example.com/ | https://other.com/style.css | yes |


**You might see one of these error messages :**

Chrome :

> DOMException: Failed to read the 'cssRules' property from 'CSSStyleSheet': Cannot access rules

Safari :

> SecurityError: Not allowed to access cross-origin stylesheet

Firefox :

> DOMException: CSSStyleSheet.cssRules getter: Not allowed to access cross-origin stylesheet

To resolve CORS errors you need to take two steps :

- add an HTTP header `Access-Control-Allow-Origin: <your-value>` when serving your CSS file.
- add `crossorigin="anonymous"` to the `<link rel="stylesheet">` tag for your CSS file.

In a node server setting the HTTP header might look like this :

```js
// http://localhost:8080 is the domain of your page!
res.setHeader('Access-Control-Allow-Origin', 'https://example.com');
```

You can also configure a wildcard but please be aware that this might be a security risk.
It is better to only set the header for the domain you want to allow and only on the responses you want to allow.

HTML might look like this :

```html
<link rel="stylesheet" href="https://example.com/styles.css" crossorigin="anonymous">
```


### Using with Next.js

Given that Next.js imports packages both on the browser and on the server, you need to make sure that the package is only imported on the browser.

As outlined in the [Next.js documentation](https://nextjs.org/docs/advanced-features/dynamic-import#with-external-libraries), you need to load the package with a dynamic import:

```jsx
useEffect(async () => {
	const cssHasPseudo = (await import('css-has-pseudo/browser')).default;
	cssHasPseudo(document);
}, []);
```

We recommend you load the polyfill as high up on your Next application as possible, such as your `pages/_app.ts` file.

## How it works

The [PostCSS Has Pseudo] clones rules containing `:has()`,
replacing them with an alternative `[csstools-has-]` selector.

```pcss
.title:has(+ p) {
	margin-bottom: 1.5rem;
}

/* becomes */

.js-has-pseudo [csstools-has-1a-38-2x-38-30-2t-1m-2w-2p-37-14-17-w-34-15]:not(does-not-exist) {
	margin-bottom: 1.5rem;
}
.title:has(+ p) {
	margin-bottom: 1.5rem;
}
```

Next, the [browser script](#browser) adds a `[:has]` attribute to
elements otherwise matching `:has` natively.

```html
<div class="title" [csstools-has-1a-38-2x-38-30-2t-1m-2w-2p-37-14-17-w-34-15]>
	<h1>A title block</h1>
	<p>With an extra paragraph</p>
</div>
```

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#has-pseudo-class
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/css-has-pseudo

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Has Pseudo]: https://github.com/csstools/postcss-plugins/tree/main/plugins/css-has-pseudo
[Selectors Level 4]: https://www.w3.org/TR/selectors-4/#has-pseudo
