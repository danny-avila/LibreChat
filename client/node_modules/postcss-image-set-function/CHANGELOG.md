# Changes to PostCSS image-set() Function

### 5.0.2 (February 8, 2023)

- Reduce the amount of duplicate fallback CSS.

### 5.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 5.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).
- Changed: `oninvalid` plugin option to `onInvalid` to match other plugins with similar options (breaking).

### 4.0.7 (July 8, 2022)

- Fix case insensitive matching.

### 4.0.6 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 4.0.5 (January 31, 2022)

- Fix sourcemaps for `image-set()` function

### 4.0.4 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).

### 4.0.3 (December 13, 2021)

- Changed: now uses `postcss-value-parser` for parsing.
- Updated: documentation
- Added: support for lists of `image-set` functions.
- Fixed: `url` function is now always added around string values in `image-set` functions.

### 4.0.2 (November 19, 2021)

- Updated: `postcss-value-parser` to 6.0.1 (patch)

### 4.0.1 (November 18, 2021)

- Added: Safeguards against postcss-values-parser potentially throwing an error.

### 4.0.0 (September 17, 2021)

- Updated: Support for PostCS 8+ (major).
- Updated: Support for Node 12+ (major).

### 3.0.1 (September 18, 2018)

- Updated: PostCSS Values Parser 2

### 3.0.0 (September 17, 2018)

- Updated: Support for PostCSS 7+
- Updated: Support for Node 6+

### 2.0.0 (May 7, 2018)

- Sort images by DPR and use the lowest as the default

### 1.0.0 (May 2, 2018)

- Initial version
