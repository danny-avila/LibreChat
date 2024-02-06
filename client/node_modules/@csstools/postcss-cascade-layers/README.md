# PostCSS Cascade Layers [<img src="https://postcss.github.io/postcss/logo.svg" alt="PostCSS Logo" width="90" height="90" align="right">][PostCSS]

[<img alt="npm version" src="https://img.shields.io/npm/v/@csstools/postcss-cascade-layers.svg" height="20">][npm-url] [<img alt="CSS Standard Status" src="https://cssdb.org/images/badges/cascade-layers.svg" height="20">][css-url] [<img alt="Build Status" src="https://github.com/csstools/postcss-plugins/workflows/test/badge.svg" height="20">][cli-url] [<img alt="Discord" src="https://shields.io/badge/Discord-5865F2?logo=discord&logoColor=white">][discord]

[PostCSS Cascade Layers] lets you use `@layer` following the [Cascade Layers Specification]. For more information on layers, checkout [A Complete Guide to CSS Cascade Layers] by Miriam Suzanne.

```pcss

target {
	color: purple;
}

@layer {
	target {
		color: green;
	}
}


/* becomes */


target:not(#\#) {
	color: purple;
}

target {
		color: green;
	}

```

## How it works

[PostCSS Cascade Layers] creates "layers" of specificity.

It applies extra specificity on all your styles based on :
- the most specific selector found
- the order in which layers are defined

```css
@layer A, B;

@layer B {
	.a-less-specific-selector {
		/* styles */
	}
}

@layer A {
	#something #very-specific {
		/* styles */
	}
}

@layer C {
	.a-less-specific-selector {
		/* styles */
	}
}
```

most specific selector :
- `#something #very-specific`
- `[2, 0, 0]`
- `2 + 1` -> `3` to ensure there is no overlap

the order in which layers are defined :
- `A`
- `B`
- `C`

| layer | previous adjustment | specificity adjustment | selector |
| ------ | ------ | ----------- | --- |
| `A` | `0` | `0 + 0 = 0` | N/A |
| `B` | `0` | `0 + 3 = 3` | `:not(#\#):not(#\#):not(#\#)` |
| `C` | `3` | `3 + 3 = 6` | `:not(#\#):not(#\#):not(#\#):not(#\#):not(#\#):not(#\#)` |

This approach lets more important (later) layers always override less important (earlier) layers.<br>
And layers have enough room internally so that each selector works and overrides as expected.

More layers with more specificity will cause longer `:not(...)` selectors to be generated.

⚠️ For this to work the plugin needs to analyze your entire stylesheet at once.<br>
If you have different assets that are unaware of each other it will not work correctly as the analysis will be incorrect.

## Usage

Add [PostCSS Cascade Layers] to your project:

```bash
npm install postcss @csstools/postcss-cascade-layers --save-dev
```

Use it as a [PostCSS] plugin:

```js
const postcss = require('postcss');
const postcssCascadeLayers = require('@csstools/postcss-cascade-layers');

postcss([
	postcssCascadeLayers(/* pluginOptions */)
]).process(YOUR_CSS /*, processOptions */);
```

[PostCSS Cascade Layers] runs in all Node environments, with special
instructions for:

- [Node](INSTALL.md#node)
- [PostCSS CLI](INSTALL.md#postcss-cli)
- [PostCSS Load Config](INSTALL.md#postcss-load-config)
- [Webpack](INSTALL.md#webpack)
- [Next.js](INSTALL.md#nextjs)
- [Gulp](INSTALL.md#gulp)
- [Grunt](INSTALL.md#grunt)

## Options

### onRevertLayerKeyword

The `onRevertLayerKeyword` option enables warnings if `revert-layer` is used.
Transforming `revert-layer` for older browsers is not possible in this plugin.

Defaults to `warn`

```js
postcssCascadeLayers({ onRevertLayerKeyword: 'warn' }) // 'warn' | false
```

```pcss
/* [postcss-cascade-layers]: handling "revert-layer" is unsupported by this plugin and will cause style differences between browser versions. */
@layer {
	.foo {
		color: revert-layer;
	}
}
```

### onConditionalRulesChangingLayerOrder

The `onConditionalRulesChangingLayerOrder` option enables warnings if layers are declared in multiple different orders in conditional rules.
Transforming these layers correctly for older browsers is not possible in this plugin.

Defaults to `warn`

```js
postcssCascadeLayers({ onConditionalRulesChangingLayerOrder: 'warn' }) // 'warn' | false
```

```pcss
/* [postcss-cascade-layers]: handling different layer orders in conditional rules is unsupported by this plugin and will cause style differences between browser versions. */
@media (min-width: 10px) {
	@layer B {
		.foo {
			color: red;
		}
	}
}

@layer A {
	.foo {
		color: pink;
	}
}

@layer B {
	.foo {
		color: red;
	}
}
```

### onImportLayerRule

The `@import` at-rule can also be used with cascade layers, specifically to create a new layer like so: 
```css
@import 'theme.css' layer(utilities);
```
If your CSS uses `@import` with layers, you will also need the [postcss-import] plugin. This plugin alone will not handle the `@import` at-rule.  

This plugin will warn you when it detects that [postcss-import] did not transform`@import` at-rules.

```js
postcssCascadeLayers({ onImportLayerRule: 'warn' }) // 'warn' | false
```

### Contributors
The contributors to this plugin were [Olu Niyi-Awosusi] and [Sana Javed] from [Oddbird] and Romain Menke.

[cli-url]: https://github.com/csstools/postcss-plugins/actions/workflows/test.yml?query=workflow/test
[css-url]: https://cssdb.org/#cascade-layers
[discord]: https://discord.gg/bUadyRwkJS
[npm-url]: https://www.npmjs.com/package/@csstools/postcss-cascade-layers

[PostCSS]: https://github.com/postcss/postcss
[PostCSS Cascade Layers]: https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-cascade-layers
[Cascade Layers Specification]: https://www.w3.org/TR/css-cascade-5/#layering
[A Complete Guide to CSS Cascade Layers]: https://css-tricks.com/css-cascade-layers/
[Olu Niyi-Awosusi]: https://github.com/oluoluoxenfree
[Sana Javed]: https://github.com/sanajaved7
[Oddbird]: https://github.com/oddbird
[postcss-import]: https://github.com/postcss/postcss-import
