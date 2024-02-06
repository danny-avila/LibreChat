# Changes to PostCSS Lab Function

### 5.2.3 (June 1, 2023)

- Updated `@csstools/postcss-progressive-custom-properties` to `2.3.0` (minor)


### 5.2.2 (May 19, 2023)

- Ignore relative color syntax
- Updated `@csstools/postcss-progressive-custom-properties` to `2.2.0` (minor)
- Updated `@csstools/css-color-parser` to `1.2.0` (minor)



### 5.2.1 (April 10, 2023)

- Updated `@csstools/css-tokenizer` to `2.1.1` (patch)
- Updated `@csstools/css-parser-algorithms` to `2.1.1` (patch)
- Updated `@csstools/css-color-parser` to `1.1.2` (patch)

### 5.2.0 (March 25, 2023)

- Add `@csstools/css-color-parser` dependency for all color value transformations.
- Add support for `calc` expressions in color components.
- Skip `color(display-p3 0 0 0)` fallbacks when the color is already in the `srgb` gamut.

### 5.1.0 (February 6, 2023)

- Add: `@csstools/color-helpers` dependency for all color value transformations.

### 5.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 5.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).

### 4.2.1 (July 8, 2022)

- Fix case insensitive matching.

### 4.2.0 (April 4, 2022)

- Allow percentage and number units in more color components.

```css
.percentages {
	color-1: lab(40% 35% 30%);
	color-2: lch(40% 50% 39);

	/* becomes */

	color-1: rgb(163, 57, 35);
	color-1: color(display-p3 0.59266 0.25309 0.17075);
	color-2: rgb(181, 30, 19);
	color-2: color(display-p3 0.65205 0.18193 0.12753);
}

.numbers {
	color-1: lab(40 35 30);
	color-2: lch(40 50 39);

	/* becomes */

	color-1: rgb(152, 68, 47);
	color-1: color(display-p3 0.55453 0.28432 0.20788);
	color-2: rgb(157, 63, 45);
	color-2: color(display-p3 0.57072 0.27138 0.20109);
}
```

### 4.1.2 (March 8, 2022)

- Fix gamut mapping giving overly unsaturated colors.
- Implement powerless color components in gamut mapping.

### 4.1.1 (February 15, 2022)

- Fix plugin name

### 4.1.0 (February 12, 2022)

- Add gamut mapping for out of gamut colors.
- Add conversion to `display-p3` as a wider gamut fallback.

[Read more about out of gamut colors](https://github.com/csstools/postcss-plugins/blob/main/plugins/postcss-lab-function/README.md#out-of-gamut-colors)

[Read more about `color(display-p3 0 0 0)`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color())

```css
.color-lab {
	color: lab(40% 56.6 39);
}

/* with a display-p3 fallback : */
.color {
	color: rgb(179, 35, 35);
	color: color(display-p3 0.64331 0.19245 0.16771);
}
```

### 4.0.4 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 4.0.3 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).

### 4.0.2 (December 13, 2021)

- Changed: now uses `postcss-value-parser` for parsing.
- Updated: documentation
- Added: support for CSS variables with `preserve: true` option.
- Fixed: Hue values with units in `lch` functions are now correctly handled.
- Fixed: Rounding of values to match current browser behavior.

### 4.0.1 (November 18, 2021)

- Added: Safeguards against postcss-values-parser potentially throwing an error.
- Updated: postcss-value-parser to 6.0.1 (patch)

### 4.0.0 (September 17, 2021)

- Updated: Support for PostCS 8+ (major).
- Updated: Support for Node 12+ (major).

### 3.1.2 (April 25, 2020)

- Updated: Publish

### 3.1.1 (April 25, 2020)

- Updated: Using `walkType` to evade walker bug in `postcss-values-parser`

### 3.1.0 (April 25, 2020)

- Updated: `postcss-values-parser` to 3.2.0 (minor).

### 3.0.1 (April 12, 2020)

- Updated: Ownership moved to CSSTools.

### 3.0.0 (April 12, 2020)

- Updated: `postcss-values-parser` to 3.1.1 (major).
- Updated: Node support to 10.0.0 (major).
- Updated: Feature to use new percentage syntax.
- Removed: Support for the removed `gray()` function.

### 2.0.1 (September 18, 2018)

- Updated: PostCSS Values Parser 2.0.0

### 2.0.0 (September 17, 2018)

- Updated: Support for PostCSS 7+
- Updated: Support for Node 6+

### 1.1.0 (July 24, 2018)

- Added: Support for `gray(a / b)` as `lab(a 0 0 / b)`

### 1.0.1 (May 11, 2018)

- Fixed: Values beyond the acceptable 0-255 RGB range

### 1.0.0 (May 11, 2018)

- Initial version
