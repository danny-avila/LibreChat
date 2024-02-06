# Changes to PostCSS Pseudo Class Any Link

### 8.0.2 (February 9, 2023)

- Reduce the amount of duplicate fallback CSS.

### 8.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 8.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).
- Fix: Do not throw when a selector is invalid, show a warning instead.

### 7.1.6 (July 8, 2022)

- Fix case insensitive `:any-link` matching.

### 7.1.5 (June 23, 2022)

- Fix selector order with any pseudo element. This plugin will no longer re-order selectors.

### 7.1.4 (May 17, 2022)

- Fix selector order with `:before` and other pseudo elements.

### 7.1.3 (May 6, 2022)

- Improve handling of `<area>` fallbacks for IE and Edge.

```diff
a:any-link {
	text-decoration: none;
}

/* becomes */

- a:link, a:visited, aarea[href] {
+ a:link, a:visited {
	text-decoration: none;
}
```

### 7.1.2 (April 4, 2022)

- Improved : compound selector order with pseudo elements

### 7.1.1 (February 5, 2022)

- Improved `es module` and `commonjs` compatibility

### 7.1.0 (January 31, 2022)

- Add support in IE and Edge for the `<area>` element
- Add support for `:any-link` in pseudo class functions (`:not(:any-link)`)

To support matching `:any-link` in IE and Edge on `<area href>` you need to set the `subFeatures.areaHrefNeedsFixing` option to `true`:

```js
postcssPseudoClassAnyLink({
  subFeatures: {
    areaHrefNeedsFixing: true
  }
})
```

### 7.0.2 (January 2, 2022)

- Removed Sourcemaps from package tarball.
- Moved CLI to CLI Package. See [announcement](https://github.com/csstools/postcss-plugins/discussions/121).

### 7.0.1 (December 13, 2021)

- Updated: documentation

### 7.0.0 (September 17, 2021)

- Updated: Support for PostCSS 8+ (major).
- Updated: Support for Node v12+ (major).

### 6.0.0 (September 17, 2018)

- Updated: Support for PostCSS v7+
- Updated: Support for Node v6+
- Updated: PostCSS Selector Parser 5.0.0-rc.3 (major)

### 5.0.0 (May 7, 2018)

- Updated: `postcss-selector-parser` to v4.0.0 (major)
- Updated: `postcss` to v6.0.22 (patch)
- Changed: Preserves `:any-link` by default

### 4.0.0 (May 10, 2017)

- Added: Support for PostCSS v6
- Added: Support for Node v4
- Removed: `prefix` option, as that would be non-spec

### 3.0.1 (December 8, 2016)

- Updated: Use destructing assignment on plugin options
- Updated: Use template literals

### 3.0.0 (December 5, 2016)

- Updated: boilerplate conventions (Node v6.9.1 LTS)

### 1.0.0 (September 1, 2015)

- Updated: PostCSS 5
- Updated: Develop dependencies
- Updated: ESLint configuration

### 0.3.0 (June 16, 2015)

- Added: Support for complex uses
- Added: Code documentation
- Changed: Coding conventions

### 0.2.1 (June 16, 2015)

- Fixed: postcss-selector-parser is included as a dependency

### 0.2.0 (June 15, 2015)

- Changed: use postcss-selector-parser

### 0.1.1 (June 14, 2015)

Initial release
