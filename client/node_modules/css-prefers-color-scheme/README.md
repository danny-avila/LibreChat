# Prefers Color Scheme [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/css-prefers-color-scheme.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/prefers-color-scheme-query.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[Prefers Color Scheme] lets you use light and dark color schemes in all browsers, following the [Media Queries] specification.

```pcss
@media (prefers-color-scheme: dark) {
	:root {
		--site-bgcolor: #1b1b1b;
		--site-color: #fff;
	}
}

@media (prefers-color-scheme: light) {
	:root {
		--site-bgcolor: #fff;
		--site-color: #222;
	}
}

/* becomes */

@media (color: 48842621) {
	:root {
		--site-bgcolor: #1b1b1b;
		--site-color: #fff;
	}
}

@media (prefers-color-scheme: dark) {
	:root {
		--site-bgcolor: #1b1b1b;
		--site-color: #fff;
	}
}

@media (color: 70318723) {
	:root {
		--site-bgcolor: #fff;
		--site-color: #222;
	}
}

@media (prefers-color-scheme: light) {
	:root {
		--site-bgcolor: #fff;
		--site-color: #222;
	}
}
```

## Usage

Add [Prefers Color Scheme] to your project:

```bash
npm install postcss css-prefers-color-scheme --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const prefersColorScheme = require('css-prefers-color-scheme');

postcss([
	prefersColorScheme(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[Prefers Color Scheme] runs in all Node environments, with special
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
prefersColorScheme({ preserve: false })
```

```pcss
@media (prefers-color-scheme: dark) {
	:root {
		--site-bgcolor: #1b1b1b;
		--site-color: #fff;
	}
}

@media (prefers-color-scheme: light) {
	:root {
		--site-bgcolor: #fff;
		--site-color: #222;
	}
}

/* becomes */

@media (color: 48842621) {
	:root {
		--site-bgcolor: #1b1b1b;
		--site-color: #fff;
	}
}

@media (color: 70318723) {
	:root {
		--site-bgcolor: #fff;
		--site-color: #222;
	}
}
```

## Browser

```js
// initialize prefersColorScheme (applies the current OS color scheme, if available)
import prefersColorSchemeInit from 'css-prefers-color-scheme/browser';
const prefersColorScheme = prefersColorSchemeInit();

// apply "dark" queries (you can also apply "light")
prefersColorScheme.scheme = 'dark';
```

or

```html
<!-- When using a CDN url you will have to manually update the version number -->
<script src="https://unpkg.com/css-prefers-color-scheme@8.0.2/dist/browser-global.js"></script>
<script>prefersColorSchemeInit()</script>
```

⚠️ Please use a versioned url, like this : `https://unpkg.com/css-prefers-color-scheme@8.0.2/dist/browser-global.js`
Without the version, you might unexpectedly get a new major version of the library with breaking changes.

[Prefers Color Scheme] works in all major browsers, including Safari 6+ and
Internet Explorer 9+ without any additional polyfills.

To maintain compatibility with browsers supporting `prefers-color-scheme`, the
library will remove `prefers-color-scheme` media queries in favor of
cross-browser compatible `color` media queries. This ensures a seamless
experience, even when JavaScript is unable to run.

### Browser Usage

Use [Prefers Color Scheme] to activate your `prefers-color-scheme` queries:

```js
import prefersColorSchemeInit from 'css-prefers-color-scheme/browser';
const prefersColorScheme = prefersColorSchemeInit();
```

By default, the current OS color scheme is applied if your browser supports it.
Otherwise, the light color scheme is applied. You may override this by passing
in a color scheme.

```js
import prefersColorSchemeInit from 'css-prefers-color-scheme/browser';
const prefersColorScheme = prefersColorSchemeInit('dark');
```

The `prefersColorScheme` object returns the following properties — `scheme`,
`hasNativeSupport`, `onChange`, and `removeListener`.

#### scheme

The `scheme` property returns the currently preferred color scheme, and it can
be changed.

```js
import prefersColorSchemeInit from 'css-prefers-color-scheme/browser';
const prefersColorScheme = prefersColorSchemeInit();

// log the preferred color scheme
console.log(prefersColorScheme.scheme);

// apply "dark" queries
prefersColorScheme.scheme = 'dark';
```

#### hasNativeSupport

The `hasNativeSupport` boolean represents whether `prefers-color-scheme` is
supported by the browser.

#### onChange

The optional `onChange` function is run when the preferred color scheme is
changed, either from the OS or manually.

#### removeListener

The `removeListener` function removes the native `prefers-color-scheme`
listener, which may or may not be applied, depending on your browser support.
This is provided to give you complete control over plugin cleanup.

#### debug

If styles are not applied you can enable debug mode to log exceptions.

```js
import prefersColorSchemeInit from 'css-prefers-color-scheme/browser';
const prefersColorScheme = prefersColorSchemeInit('light', { debug: true });
```

```html
<script src="https://unpkg.com/css-prefers-color-scheme@8.0.2/dist/browser-global.js"></script>
<script>prefersColorSchemeInit('light', { debug: true })</script>
```


### Browser Dependencies

Web API's:

- [Window.matchMedia](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia)

ECMA Script:

- `Object.defineProperty`
- `Array.prototype.forEach`
- `Array.prototype.indexOf`
- `RegExp.prototype.exec`
- `String.prototype.match`
- `String.prototype.replace`

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
	const prefersColorSchemeInit = (await import('css-prefers-color-scheme/browser')).default;
	const prefersColorScheme = prefersColorSchemeInit();
}, []);
```

## How does it work?

[Prefers Color Scheme] is a [PostCSS] plugin that transforms `prefers-color-scheme` queries into `color` queries.
This changes `prefers-color-scheme: dark` into `(color: 48842621)` and `prefers-color-scheme: light` into `(color: 70318723)`.

The frontend receives these `color` queries, which are understood in all
major browsers going back to Internet Explorer 9.
However, since browsers can only have a reasonably small number of bits per color,
our color scheme values are ignored.

[Prefers Color Scheme] uses a [browser script](#browser) to change
`(color: 48842621)` queries into `(max-color: 48842621)` in order to
activate “dark mode” specific CSS, and it changes `(color: 70318723)` queries
into `(max-color: 48842621)` to activate “light mode” specific CSS.

```css
@media (color: 70318723) { /* prefers-color-scheme: light */
	body {
		background-color: white;
		color: black;
	}
}
```

Since these media queries are accessible to `document.styleSheet`, no CSS
parsing is required.

### Why does the fallback work this way?

The value of `48` is chosen for dark mode because it is the keycode for `0`,
the hexidecimal value of black. Likewise, `70` is chosen for light mode because
it is the keycode for `f`, the hexidecimal value of white.
These are suffixed with a random large number.

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#prefers-color-scheme-query
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/css-prefers-color-scheme

[PostCSS]: https://github.com/postcss/postcss
[Prefers Color Scheme]: https://github.com/csstools/postcss-plugins/tree/main/plugins/css-prefers-color-scheme
[Media Queries]: https://www.w3.org/TR/mediaqueries-5/#prefers-color-scheme
