# Changes to PostCSS Gradients Interpolation Method

### 3.0.6 (June 1, 2023)

- Updated `@csstools/postcss-progressive-custom-properties` to `2.3.0` (minor)


### 3.0.5 (May 19, 2023)

- Updated `@csstools/postcss-progressive-custom-properties` to `2.2.0` (minor)
- Updated `@csstools/css-color-parser` to `1.2.0` (minor)



### 3.0.4 (April 17, 2023)

- Fix infinite loop when parsing gradient functions. (see : https://github.com/csstools/postcss-plugins/issues/948)

### 3.0.3 (April 10, 2023)

- Updated `@csstools/css-tokenizer` to `2.1.1` (patch)
- Updated `@csstools/css-parser-algorithms` to `2.1.1` (patch)
- Updated `@csstools/css-color-parser` to `1.1.2` (patch)

### 3.0.2 (April 10, 2023)

- Fix interpolation method `longer`, `increasing`,... for color stops with the same color.

### 3.0.1 (March 28, 2023)

- Skip gamut mapping for interpolation color hints.

### 3.0.0 (March 25, 2023)

- Handle `color-mix()` internally with `@csstools/css-color-parser`

### 2.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 2.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).

### 1.0.1 (March 7, 2022)

- fix dependencies

### 1.0.0 (March 4, 2022)

- Initial version
