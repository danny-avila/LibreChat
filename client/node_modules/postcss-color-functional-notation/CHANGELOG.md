# Changes to PostCSS Color Functional Notation

### 5.1.0 (June 1, 2023)

- Added `@csstools/postcss-progressive-custom-properties` for improved support of custom properties.
- Updated `@csstools/postcss-progressive-custom-properties` to `2.3.0` (minor)


### 5.0.2 (February 6, 2023)

- Reduce the amount of duplicate fallback CSS.

### 5.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 5.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).

### 4.2.4 (July 8, 2022)

- Fix case insensitive matching.

### 4.2.3 (May 19, 2022)

- Handle modern channel values in legacy notation (comma separated)

```css
.color {
  color: rgba(0, 255, 0, 50%);
}

/* becomes */

.color {
  color: rgba(0, 255, 0, 0.5);
}
```

### 4.2.2 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 4.2.1 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).

### 4.2.0 (December 27, 2021)

- Added: support for Alpha value as the fourth argument in comma separated values notation.

### 4.1.0 (December 15, 2021)

- Added: support for Alpha value as a CSS variable in `rgb()` and `rgba()`.

### 4.0.2 (December 13, 2021)

- Changed: now uses `postcss-value-parser` for parsing.
- Updated: documentation
- Added: support for CSS variables with `preserve: true` option.

### 4.0.1 (November 18, 2021)

- Added: Safeguards against postcss-values-parser potentially throwing an error.
- Updated: postcss-value-parser to 6.0.1 (patch)

### 4.0.0 (September 17, 2021)

- Updated: Support for PostCS 8+ (major).
- Updated: Support for Node 12+ (major).

### 3.0.2 (April 25, 2020)

- Updated: Publish

### 3.0.1 (April 25, 2020)

- Updated: Using `walkType` to evade walker bug in `postcss-values-parser`

### 3.0.0 (April 25, 2020)

- Updated: Support for Node 10+
- Updated: `postcss` to 7.0.27 (patch)
- Updated: `postcss-values-parser` to 3.2.0 (minor)

### 2.0.1 (September 18, 2018)

- Updated: PostCSS Values Parser 2 (patch for this project)

### 2.0.0 (September 17, 2018)

- Updated: Support for PostCSS v7+
- Updated: Support for Node 6+

### 1.0.2 (July 13, 2018)

- Fixed: Poorly detected hsl() and rgb() now resolve correctly

### 1.0.1 (May 11, 2018)

- Fixed: A non-percentage 0 works alongside other percentages

### 1.0.0 (May 7, 2018)

- Initial version
