# Changes to PostCSS Dir Pseudo Class

### 7.0.2 (February 6, 2023)

- Reduce the amount of duplicate fallback CSS.

### 7.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 7.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).
- Added: TypeScript support.

### 6.0.5 (July 8, 2022)

- Fix case insensitive matching.

### 6.0.4 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 6.0.3 (January 12, 2022)

- Fix compatibility with PostCSS `v8.2.x` [#147](https://github.com/csstools/postcss-plugins/issues/147)

This version is not officially supported but some tool providers pinned PostCSS to `v8.2.x`,
making it impossible for end users to have a working setup.

### 6.0.2 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).

### 6.0.1 (December 13, 2021)

- Updated: documentation

### 6.0.0 (September 17, 2021)

- Updated: Support for PostCS 8+ (major).
- Updated: Support for Node 12+ (major).

### 5.0.0 (September 17, 2018)

- Updated: Support for PostCSS v7+
- Updated: Support for Node v6+
- Updated: `postcss-selector-parser` to v5.0.0-rc.3+ (major)

### 4.0.0 (May 8, 2018)

- Updated: `postcss-selector-parser` to v4.0.0 (major)
- Updated: `postcss` to v6.0.22 (patch)

### 3.0.0 (March 21, 2018)

- Added: `preserve` option to preserve the original `:dir()` rule
- Updated: `postcss-selector-parser` to v3 (major)
- Removed: `browsers` option which is better covered by
  [PostCSS Preset Env](https://github.com/jonathantneal/postcss-preset-env/)

### 2.1.0 (September 19, 2017)

- Fixed: Enforcement of presumed direction, e.g. `html:dir([dir="rtl"])`
- Updated: Browserslist and PostCSS
- Improved: How options are safely called, i.e. `Object(opts)`

### 2.0.0 (July 24, 2017)

- Changed: Method of presumed direction from `:root` to `html:not([dir])`

### 1.1.0 (June 2, 2017)

- Added: Support for browserslist and a 'browsers' option
- Added: Support for a presumed direction via the 'browsers' option

### 1.0.0 (May 30, 2017)

- Initial version
