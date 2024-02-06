# Changes to PostCSS Color Function

### 2.2.3 (June 1, 2023)

- Updated `@csstools/postcss-progressive-custom-properties` to `2.3.0` (minor)


### 2.2.2 (May 19, 2023)

- Ignore relative color syntax
- Updated `@csstools/postcss-progressive-custom-properties` to `2.2.0` (minor)
- Updated `@csstools/css-color-parser` to `1.2.0` (minor)



### 2.2.1 (April 10, 2023)

- Updated `@csstools/css-tokenizer` to `2.1.1` (patch)
- Updated `@csstools/css-parser-algorithms` to `2.1.1` (patch)
- Updated `@csstools/css-color-parser` to `1.1.2` (patch)

### 2.2.0 (March 25, 2023)

- Add `@csstools/css-color-parser` dependency for all color value transformations.
- Add support for `calc` expressions in color components.
- Remove support for missing channel values (`color(display-p3 1)`). This was never documented and was removed from the specification.

### 2.1.0 (February 6, 2023)

- Add: `@csstools/color-helpers` dependency for all color value transformations.

### 2.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 2.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).

### 1.1.1 (July 8, 2022)

- Fix case insensitive matching.

### 1.1.0 (April 4, 2022)

- Allow percentage units in XYZ color spaces.

```css
.percentages {
	color-1: color(xyz-d50 64.331% 19.245% 16.771%);
	color-2: color(xyz-d65 64.331% 19.245% 16.771%);
	color-3: color(xyz 64.331% 19.245% 16.771%);

	/* becomes */

	color-1: rgb(245,0,135);
	color-2: rgb(253,0,127);
	color-3: rgb(253,0,127);
}
```

### 1.0.3 (March 8, 2022)

- Fix gamut mapping giving overly unsaturated colors.
- Implement powerless color components in gamut mapping.

### 1.0.2 (February 12, 2022)

- Updated `@csstools/postcss-progressive-custom-properties` to `1.1.0`.

### 1.0.1 (February 11, 2022)

- Add tests for percentage values in non-xyz color spaces.
- Ignore percentage values in xyz color space as these are not supported.

### 1.0.0 (February 7, 2022)

- Initial version
