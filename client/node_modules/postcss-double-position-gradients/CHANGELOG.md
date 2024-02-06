# Changes to PostCSS Double Position Gradients

### 4.0.4 (June 1, 2023)

- Updated `@csstools/postcss-progressive-custom-properties` to `2.3.0` (minor)


### 4.0.3 (May 19, 2023)

- Updated `@csstools/postcss-progressive-custom-properties` to `2.2.0` (minor)


### 4.0.2 (February 8, 2023)

- Reduce the amount of duplicate fallback CSS.

### 4.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 4.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).

### 3.1.2 (July 8, 2022)

- Fix case insensitive matching.

### 3.1.1 (March 7, 2022)

- Add TypeScript support
- Fix color functions.
- Fix `at` keyword with `at 20px 20px` being interpreted as a double position color stop.

### 3.1.0 (February 15, 2022)

- Ignore values in relevant `@supports` rules.
- Support double position gradients in Custom Properties.

```css
@supports (order: linear-gradient(90deg, black 25% 50%, blue 50% 75%)) {
	.support {
		/* is not processed */
		order: linear-gradient(90deg, black 25% 50%, blue 50% 75%);
	}
}
```

### 3.0.5 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 3.0.4 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).

### 3.0.3 (December 14, 2021)

- Fixed: infinite loop in complex gradients.

### 3.0.2 (December 13, 2021)

- Changed: now uses `postcss-value-parser` for parsing.
- Updated: documentation

### 3.0.1 (November 18, 2021)

- Added: Safeguards against postcss-values-parser potentially throwing an error.

- Fixed: Issue with some gradients creating an infinite loop.

- Updated: `postcss-value-parser` to 6.0.1 (patch)
- Updated: `eslint` to 8.2.0 (major)
- Updated: `postcss` to 8.3.11 (patch)

- Removed: yarn.lock is no longer version controlled

### 3.0.0 (September 17, 2021)

- Updated: Support for PostCS 8+ (major).
- Updated: Support for Node 12+ (major).

### 2.0.0 (April 25, 2020)

- Updated: `postcss` to 7.0.27 (patch)
- Updated: `postcss-value-parser` to 3.2.1 (major)
- Updated: Support for Node 10+ (major)

### 1.0.0 (October 28, 2018)

- Initial version
