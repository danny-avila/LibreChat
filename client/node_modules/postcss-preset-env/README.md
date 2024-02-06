# PostCSS Preset Env [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS" width="90" height="90" align="right">][postcss]

[<img alt="npm version" src="https://img.shields.io/npm/v/postcss-preset-env.svg" height="20">][npm-url]
[<img alt="build status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url]
[![install size][package-phobia-badge]][package-phobia]
[<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Preset Env] lets you convert modern CSS into something most browsers
can understand, determining the polyfills you need based on your targeted
browsers or runtime environments.

## Quick start

[PostCSS Preset Env] is a [PostCSS] plugin.<br>
If you are already using [PostCSS] to build your CSS, you can simply add [PostCSS Preset Env] to your configuration.

- Install `postcss-preset-env` from npm.
- Add `postcss-preset-env` to your configuration:

```js
const postcssPresetEnv = require('postcss-preset-env');

const yourConfig = {
	plugins: [
		postcssPresetEnv(/* pluginOptions */)
	]
}
```

_[Read more on how to use and install PostCSS Preset Env.](#usage)_

## How does it work?

[PostCSS Preset Env] is a Plugin Pack for [PostCSS]. It leverages the list of the features we keep an eye from [CSSDB][cssdb] and applies plugins, so you can use those new features without having to worry about browser support.

CSSDB exposes the browser support that each feature has which can come from [Can I Use](https://caniuse.com/css-all) or from [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/all) (through [mdn/browser-compat-data](https://github.com/mdn/browser-compat-data)).

By providing a list of browser targets for your project, plugins that aren't needed will be skipped. Over time your targets might change and by updating the settings your CSS bundle will only ever contain the needed fallbacks.

What [PostCSS Preset Env] does is to take the support data that comes from MDN and Can I Use and determine from a [browserslist](https://github.com/browserslist/browserslist) whether those transformations are needed. It also packs [Autoprefixer](https://github.com/postcss/autoprefixer) within and shares the list with it, so prefixes are only applied when you're going to need them given your browser support list.

### Glossary:

* **Browser list option**: [Browserslist](https://github.com/browserslist/browserslist) is a package that gives you a list of browsers for a given query. For example, `chrome < 42` will give you a list of every Chrome version that has been released up to, but not including, 42.
* **Browser support stats**: Features get introduced on browsers at certain versions. They're often visible on [MDN](https://developer.mozilla.org/en-US/) and [Can I Use](https://caniuse.com/). Comparing these stats with the needed _support_ for your project tells you if it's safe to use a feature or not.
* **CSS Feature**: A CSS feature is often part of some spec that enables a specific feature. For example, `hwb` functional notation lets you express a given color according to its hue, whiteness, and blackness. This is part of the CSS Color 4 Spec.
* **CSS Spec**: A Spec is a document that collects new features, what problems are they trying to solve and how it's intended to be solved (generally). This is usually an evolving document that goes over lengthy discussions between several people from different companies.
* **Plugin**: A plugin is package that's intended (usually) to enable a new CSS Feature by leveraging PostCSS. This doesn't need to be part of any spec. An example of the latter is [PostCSS Mixins](https://github.com/postcss/postcss-mixins), a concept that existed on Less or Sass, but it's not part of any spec. This plugin plack **only** packs plugins that enable features acknowledged by the World Wide Web Consortium (W3C) which will then be implemented by browsers later.
* **Polyfill**: A polyfill is a piece of code (usually JavaScript on the Web) used to provide modern functionality on older browsers that do not natively support it. A polyfill _should_ be indistinguishable from the native behaviour.

Here's a quick example of the syntax you can leverage by using [PostCSS Preset Env].

```pcss
@custom-media --viewport-medium (width <= 50rem);
@custom-selector :--heading h1, h2, h3, h4, h5, h6;

:root {
  --mainColor: #12345678;
}

body {
  color: var(--mainColor);
  font-family: system-ui;
  overflow-wrap: break-word;
}

:--heading {
  background-image: image-set(url(img/heading.png) 1x, url(img/heading@2x.png) 2x);

  @media (--viewport-medium) {
    margin-block: 0;
  }
}

a {
  color: rgb(0 0 100% / 90%);

  &:hover {
    color: rebeccapurple;
  }
}

/* becomes */

:root {
  --mainColor: rgba(18, 52, 86, 0.47059);
}

body {
  color: rgba(18, 52, 86, 0.47059);
  color: var(--mainColor);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Droid Sans, Helvetica Neue;
  word-wrap: break-word;
}

h1, h2, h3, h4, h5, h6 {
  background-image: url(img/heading.png);
}

@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
  h1, h2, h3, h4, h5, h6 {
    background-image: url(img/heading@2x.png)
  }
}

@media (max-width: 50rem) {
  h1, h2, h3, h4, h5, h6 {
    margin-top: 0;
    margin-bottom: 0;
  }
}

a {
  color: rgba(0, 0, 255, 0.9)
}

a:hover {
  color: #639;
}
```

Without any configuration options, [PostCSS Preset Env] enables **Stage 2**
features and supports **all** browsers.

[**Try it out in the Playground!**](https://preset-env.cssdb.org/playground/)

⚠️ Please note that some features need a companion library that makes 
the feature work. While we try to avoid this requirement, there are instances
in which this isn't possible to polyfill a new behaviour with _just_ CSS.

[See the list below](#plugins-that-need-client-library).

## Usage

Add [PostCSS Preset Env] to your project:

```bash
npm install postcss-preset-env --save-dev
```

Use [PostCSS Preset Env] as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssPresetEnv = require('postcss-preset-env');

postcss([
  postcssPresetEnv(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Preset Env] runs in all Node environments, with special instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## Options

### stage

The `stage` option determines which CSS features to polyfill, based upon their
stability in the process of becoming implemented web standards.

```js
postcssPresetEnv({ stage: 0 })
```

The `stage` can be `0` (experimental) through `4` (stable), or `false`. Setting
`stage` to `false` will disable every polyfill. Doing this would only be useful
if you intended to exclusively use the [`features`](#features) option.

Default: `2`

### minimumVendorImplementations

The `minimumVendorImplementations` option determines which CSS features to polyfill, based their implementation status.
This can be used to enable plugins that are available in browsers regardless of the [spec status](#stage).

```js
postcssPresetEnv({ minimumVendorImplementations: 2 })
```

`minimumVendorImplementations` can be `0` (no vendor has implemented it) through `3` (all major vendors).<br>

Default: `0`

**Note:**

When a feature has not yet been implemented by any vendor it can be considered experimental.<br>
Even with a single implementation it might still change in the future.<br>
Sometimes issues with a feature/specification are only discovered after it becomes available.

A value of `2` is recommended when you want to use only those features that should be [stable](#stability-and-portability).

Having 2 independent implementations is [a critical step in proposals becoming standards](https://www.w3.org/2021/Process-20211102/#implementation-experience) and a good indicator of a feature's stability.

### features

The `features` option enables or disables specific polyfills by ID. Passing
`true` to a specific feature ID will enable its polyfill, while passing `false`
will disable it. [List of Features](https://github.com/csstools/postcss-plugins/blob/main/plugin-packs/postcss-preset-env/FEATURES.md)

```js
postcssPresetEnv({
  /* use stage 3 features + css nesting rules */
  stage: 3,
  features: {
    'nesting-rules': true
  }
})
```

Passing an object to a specific feature ID will both enable and configure it.

```js
postcssPresetEnv({
  /* use stage 3 features + custom-selectors (preserving the original CSS) */
  stage: 3,
  features: {
    'custom-selectors': { preserve: true }
  }
})
```

Any polyfills not explicitly enabled or disabled through `features` are
determined by the [`stage`](#stage) option.

### browsers

The `browsers` option determines which polyfills are required based upon the
browsers you are supporting.

[PostCSS Preset Env] supports any standard [browserslist] configuration, which
can be a `.browserslistrc` file, a `browserslist` key in `package.json`, or
`browserslist` environment variables.

The `browsers` option should only be used when a standard browserslist
configuration is not available.

```js
postcssPresetEnv({ browsers: 'last 2 versions' })
```

If no valid browserslist configuration is specified, the
[default browserslist query](https://github.com/browserslist/browserslist#queries)
will be used.

### insertBefore / insertAfter

The `insertBefore` and `insertAfter` keys allow you to insert other PostCSS
plugins into the chain. This is only useful if you are also using sugary
PostCSS plugins that must execute before or after certain polyfills.
Both `insertBefore` and `insertAfter` support chaining one or multiple plugins.

```js
import postcssSimpleVars from 'postcss-simple-vars';

postcssPresetEnv({
  insertBefore: {
    'all-property': postcssSimpleVars
  }
})
```

### autoprefixer

[PostCSS Preset Env] includes [autoprefixer] and [`browsers`](#browsers) option
will be passed to it automatically.

Specifying the `autoprefixer` option enables passing
[additional options](https://github.com/postcss/autoprefixer#options)
into [autoprefixer].

```js
postcssPresetEnv({
  autoprefixer: { grid: true }
})
```

Passing `autoprefixer: false` disables autoprefixer.

⚠️ [autoprefixer] has [complex logic to fix CSS Grid in IE and older Edge](https://github.com/postcss/autoprefixer#grid-autoplacement-support-in-ie).

This can have unexpected results with certain features and when [`preserve: true`](#preserve) is used. (defaults to `true`)

```pcss
:root {
  --grid-gap: 15px;
}

.test-grid {
	grid-gap: var(--grid-gap);
	grid-template-columns: repeat(2, 1fr);
}
```

Becomes :

```
.test-grid {
	grid-gap: 15px;
	grid-gap: var(--grid-gap);
	-ms-grid-columns: 1fr var(--grid-gap) 1fr;
	grid-template-columns: repeat(2, 1fr);
}
```

The prefixed `-ms-grid-columns` still has a custom property: `1fr var(--grid-gap) 1fr;` which won't work.<br />
This example shows issues with custom properties but other transforms might have similar issues.

If you target IE or older Edge it is best to avoid using other modern features in grid property values.<br />
As a last resort you can set [`preserve: false`](#preserve), we do not advice this as doing so purely to fix issues with CSS grid.

_older Edge is any version before chromium (<79)_

### preserve

The `preserve` option determines whether all plugins should receive a
`preserve` option, which may preserve or remove otherwise-polyfilled CSS. By
default, this option is not configured.

```js
postcssPresetEnv({
  preserve: false // instruct all plugins to omit pre-polyfilled CSS
});
```

### debug

The `debug` option enables debugging messages to stdout which should be useful to help you debug which features have been enabled/disabled and why.

### enableClientSidePolyfills

The `enableClientSidePolyfills` enables all features that also need an extra browser library to be loaded into the page for it to work. Defaults to `false`.

- Note that manually enabling/disabling features via the "feature" option overrides this flag.
- This only controls if the PostCSS plugins are enabled. It does not cause the browsers libraries to be included in your bundle.

### logical

The `logical` option can hold an object which lets you specify direction of the inline and block axes and will affect the
following features:

- `logical-properties-and-values`: [PostCSS Logical](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-logical#readme)
- `float-clear-logical-values`: [PostCSS Logical Float And Clear](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-logical#readme)
- `logical-resize`: [PostCSS Logical Resize](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-logical-resize#readme)
- `logical-viewport-units`: [PostCSS Logical Viewport Units](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-logical-viewport-units#readme)

It should have `blockDirection` and/or `inlineDirection` which can be any of the following:

- `top-to-bottom`
- `bottom-to-top`
- `left-to-right`
- `right-to-left`

```js
postcssPresetEnv({
  logical: { // instruct all logical plugins to set inline axis to right to left
		inlineDirection: 'right-to-left',
	},
});
```

```pcss
.element {
	float: inline-start;
	padding-inline-end: 10px;
}
```

Becomes :

```
.element {
	float: right;
	padding-left: 10px;
}
```

You can't mix two vertical directions or two horizontal directions so for example `top-to-bottom` and `right-to-left` are valid, but `top-to-bottom` and `bottom-to-top` are not.

You might want to tweak these values if you are using a different writing system, such as Arabic, Hebrew or Chinese for example.

## Stability and Portability

[PostCSS Preset Env] will often include very modern CSS features that are not fully ready yet.
This gives users the chance to play around with these features and provide feedback.

If the specification changes or is abandoned a new major version of the plugin will be released.
This will require you to update your source code so that everything works as expected.

To have more stability between updates of [PostCSS Preset Env] you may set `stage: 3` and/or `minimumVendorImplementations: 2`.

A side effect of staying close to the standard is that you can more easily migrate your project to other tooling all together.

## Plugins list

### Plugins that need client library

This is the current list of features that need a client library with a link
to the polyfill's library.

* `blank-pseudo-class`: [Plugin](https://github.com/csstools/postcss-plugins/blob/main/plugins/css-blank-pseudo) / [Polyfill](https://github.com/csstools/postcss-plugins/blob/main/plugins/css-blank-pseudo#browser)
* `focus-visible-pseudo-class`: [Plugin](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-focus-visible) / [Polyfill](https://github.com/WICG/focus-visible)
* `focus-within-pseudo-class`: [Plugin](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-focus-within) / [Polyfill](https://github.com/csstools/postcss-plugins/blob/main/plugins/postcss-focus-within#browser)
* `has-pseudo-class`: [Plugin](https://github.com/csstools/postcss-plugins/blob/main/plugins/css-has-pseudo) / [Polyfill](https://github.com/csstools/postcss-plugins/blob/main/plugins/css-has-pseudo#browser)
* `prefers-color-scheme-query`: [Plugin](https://github.com/csstools/postcss-plugins/blob/main/plugins/css-prefers-color-scheme) / [Polyfill](https://github.com/csstools/postcss-plugins/blob/main/plugins/css-prefers-color-scheme#browser)

If you want to enable all these types of features, please check the [`enableClientSidePolyfills` option](#enableclientsidepolyfills).

### Plugins not affected by Browser Support

Given they have no support they will always be enabled if they match by Stage:

* `blank-pseudo-class`: [Plugin](https://github.com/csstools/postcss-plugins/blob/main/plugins/css-blank-pseudo) / [Polyfill](https://github.com/csstools/postcss-plugins/blob/main/plugins/css-blank-pseudo#browser)
* `custom-media-queries`: [Plugin](https://github.com/postcss/postcss-custom-media)
* `nesting-rules`: [Plugin](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-nesting)

[cli-img]: https://github.com/csstools/postcss-plugins/workflows/test/badge.svg
[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[discord]: https://discord.gg/bUadyRwkJS
[npm-img]: https://img.shields.io/npm/v/postcss-preset-env.svg
[npm-url]: https://www.npmjs.com/package/postcss-preset-env
[package-phobia-badge]: https://packagephobia.com/badge?p=postcss-preset-env
[package-phobia]: https://packagephobia.com/result?p=postcss-preset-env

[autoprefixer]: https://github.com/postcss/autoprefixer
[browserslist]: https://github.com/browserslist/browserslist#readme
[caniuse]: https://caniuse.com/
[cssdb]: https://cssdb.org/
[PostCSS]: https://github.com/postcss/postcss
[PostCSS Preset Env]: https://github.com/csstools/postcss-plugins/tree/main/plugin-packs/postcss-preset-env
