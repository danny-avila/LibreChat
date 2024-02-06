# Changes to PostCSS Focus Within

### 7.0.2 (February 8, 2023)

- Reduce the amount of duplicate fallback CSS.

### 7.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 7.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).
- Fix: Do not throw when a selector is invalid, show a warning instead.

### 6.1.1 (August 23, 2022)

- Fix: assign global browser polyfill to `window`, `self` or a blank object.

### 6.1.0 (July 30, 2022)

- Added: `disablePolyfillReadyClass` plugin option to prevent `.js-focus-within` from being added.

### 6.0.0 (July 8, 2022)

- Breaking: Changed generated classes so it prepends `.js-focus-within` to the
generated class so CSS is applied when the polyfill is known to be running.
- Added: Now bundling browser polyfill.

### 5.0.4 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 5.0.3 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).

### 5.0.2 (December 13, 2021)

- Changed: now uses `postcss-selector-parser` for parsing.
- Updated: documentation

### 5.0.1 (September 22, 2021)

- Added missing `dist` to bundle.
- Added missing `exports` to `package.json`
- Added missing `types` to `package.json`
- Added bundling & testing as prepublish step.

### 5.0.0 (September 17, 2021)

- Updated: Support for PostCS 8+ (major).
- Updated: Support for Node 12+ (major).

### 4.0.0 (April 20, 2020)

- Fixed: Allow `:focus-within` to appear escaped in a selector
- Updated: Support for Node 10+
- Updated: Ownership moved to CSS Tools

### 3.0.0 (September 17, 2018)

- Updated: Support for PostCSS v7+
- Updated: Support for Node v6+

### 2.0.0 (April 7, 2018)

- Changed: default functionality to preserve the original rule
- Added: `preserve` option to preserve the original rule using `:focus-within`

### 1.0.0 (February 17, 2018)

- Initial version
