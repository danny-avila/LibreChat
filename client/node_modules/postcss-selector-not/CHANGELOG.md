# Changes to PostCSS Selector Not

### 7.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 7.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).
- Fix: Do not throw when a selector is invalid, show a warning instead.

### 6.0.1 (July 8, 2022)

- Fixed: Case insensitive `:not` matching.

### 6.0.0 (June 3, 2022)

- Fixed: default export ([#409](https://github.com/csstools/postcss-plugins/issues/409))
- Fixed: doesn't consider attribute selectors (https://github.com/postcss/postcss-selector-not/issues/23)
- Fixed: unexpected results when `:not` is not a pseudo class function (https://github.com/postcss/postcss-selector-not/issues/28)

### 5.0.0 (January 31, 2021)

- Added: Support for PostCSS v8.

### 4.0.1 (December 18, 2020)

- Fixed: error when attribute selector containing :not (https://github.com/postcss/postcss-selector-not/pull/17)

### 4.0.0 (September 17, 2017)

- Added: compatibility with postcss v7.x
- Added: compatibility with node v6.x

### 3.0.1 (May 11, 2015)

- Fixed: incorrect export (https://github.com/postcss/postcss-selector-not/issues/8)

### 3.0.0 (May 11, 2017)

- Added: compatibility with postcss v6.x

### 2.0.0 (August 25, 2015)

- Removed: compatibility with postcss v4.x
- Added: compatibility with postcss v5.x

### 1.2.1 (June 16, 2015)

- Fixed: selector was updated as an array, which is wrong.

### 1.2.0 (June 16, 2015)

- Fixed: spec has been previously misinterpreted and now transform correctly
`:not()` level 4 to collapsed level 3
(https://github.com/postcss/postcss-selector-not/issues/1)
- Removed: `lineBreak` option (useless now)

### 1.1.0 (June 13, 2015)

- Added: `lineBreak` option

### 1.0.2 (June 13, 2015)

- Fixed: support of pseudo classes that use parenthesis

### 1.0.1 (April 30, 2015)

- Fixed: the module now works in non babel environments

### 1.0.0 (April 30, 2015)

✨ First release
