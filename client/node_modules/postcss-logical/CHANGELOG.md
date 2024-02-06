# Changes to PostCSS Logical Properties

### 6.2.0 (May 19, 2023)

- Added: Support for logical properties in `transition`

### 6.1.0 (February 15, 2023)

- Adding support for `max-block-size`, `min-block-size`, `max-inline-size` and `min-inline-size`.

### 6.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 6.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).
- Added: TypeScript support.
- Added: Support for `block-size`, `inline-size` and `caption-side`.
- Removed: Support for the `logical` keyword within `margin`, `padding`, `border-width`, `border-style`, `border-color` properties. (major)
- Removed support for `preserve` option. Changes are no longer preserved (major).
- Removed support for transforming `float`, `clear` and `resize` properties. (major)
- Updated: The plugin now requires block and inline direction to be configured (uses `top-to-bottom` and `left-to-right` respectively) and no longer introduces `:dir` (major).

### 5.0.4 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 5.0.3 (January 12, 2022)

- Fix compatibility with PostCSS `v8.2.x` [#147](https://github.com/csstools/postcss-plugins/issues/147)

This version is not officially supported but some tool providers pinned PostCSS to `v8.2.x`,
making it impossible for end users to have a working setup.

### 5.0.2 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).
- Updated examples in README.

### 5.0.1 (December 13, 2021)

- Updated: documentation

### 5.0.0 (September 17, 2021)

- Updated: Support for PostCS 8+ (major).
- Updated: Support for Node 12+ (major).

### 4.0.2 (June 10, 2019)

- Fixed: Restored transforms for `max-block-size`, `max-inline-size`,
	`min-block-size`, and `min-inline-size`.

### 4.0.1 (June 10, 2019)

- Fixed: An issue with `block-size` and `inline-size` being miscalculated.

### 4.0.0 (June 5, 2019)

- Added: Logical border-radius properties, which include
	`border-end-end-radius`, `border-end-start-radius`, `border-start-end-radius`,
	and `border-start-start-radius`.
- Removed: All unknown logical properties, which include `border-end`,
	`border-end-color`, `border-end-style`, `border-end-width`, `border-start`,
	`border-start-color`, `border-start-style`, `border-start-width`, `inset-end`,
	`inset-start`, `margin-end`, `margin-start`, `padding-end`, `padding-start`
	and `border` with `logical`.
- Updated: `transition` and `transition-property` to support the changes.
- Updated: `postcss` to 7.0.16 (patch)
- Updated: Node 8+ compatibility (major)

### 3.0.0 (September 20, 2018)

- Added: Support for logical properties within `transition` and
	`transition-property`.
- Changed: Physical rule fallbacks are written as full selectors rather than
	as nesting selectors.

### 2.0.0 (September 17, 2018)

- Updated: Support for PostCSS v7+
- Updated: Support for Node v6+

### 1.1.1 (March 21, 2017)

- Fix `dir` option to allow falsey value

### 1.1.0 (March 20, 2017)

- Add `preserve` option to preserve logical properties and values

### 1.0.2 (Aug 15, 2017)

- Improve flow-relative clear support

### 1.0.1 (Aug 13, 2017)

- Improve flow-relative border support

### 1.0.0 (Aug 8, 2017)

- Initial version
