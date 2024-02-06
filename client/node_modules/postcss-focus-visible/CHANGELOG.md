# Changes to PostCSS Focus Visible

### 8.0.2 (February 8, 2023)

- Reduce the amount of duplicate fallback CSS.

### 8.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 8.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).
- Fix: Do not throw when a selector is invalid, show a warning instead.

### 7.1.0 (July 30, 2022)

- Added: `disablePolyfillReadyClass` plugin option to prevent `.js-focus-visible` from being added.

### 7.0.0 (July 8, 2022)

- Breaking: Changed generated classes so it prepends `.js-focus-visible` to the 
generated class so CSS is applied when the polyfill is known to be running.

### 6.0.4 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 6.0.3 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).

### 6.0.2 (December 13, 2021)

- Changed: now uses `postcss-selector-parser` for parsing.
- Updated: documentation

### 6.0.1 (September 22, 2021)

- Added missing `dist` to bundle.
- Added missing `exports` to `package.json`
- Added missing `types` to `package.json`
- Added bundling & testing as prepublish step.

### 6.0.0 (September 17, 2021)

- Updated: Support for PostCS 8+ (major).
- Updated: Support for Node 12+ (major).

### 5.0.0 (April 14, 2020)

- Updated: `:focus-visible` can appear escaped in a selector
- Updated: Support for Node v10+

### 4.0.0 (September 17, 2018)

- Updated: Support for PostCSS v7+
- Updated: Support for Node v6+

### 3.0.0 (April 7, 2018)

- Changed: default functionality to preserve the original rule
- Added: `preserve` option to preserve the original rule using `:focus-visible`

### 2.0.0 (February 17, 2018)

- Changed `:focus-ring` to `:focus-visible` per the specification
- Removed `assignTo` export option

### 1.0.0 (May 22, 2017)

- Initial version
