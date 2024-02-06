# Changes to Selector Specificity

### 2.2.0 (March 21, 2023)

- Add support for:
	- `::view-transition`
	- `::view-transition-group(*)` and `::view-transition-group(name)`
	- `::view-transition-image-par(*)` and `::view-transition-image-par(name)`
	- `::view-transition-old(*)` and `::view-transition-old(name)`
	- `::view-transition-new(*)` and `::view-transition-new(name)`

### 2.1.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 2.1.0 (January 19, 2023)

- Add support for `::slotted`
- Add support for `:host`
- Add support for `:host-context`

### 2.0.2 (July 8, 2022)

- Fix case insensitive matching.

### 2.0.1 (June 10, 2022)

- Fixed: Exception on `:nth-child` without arguments. [#439](https://github.com/csstools/postcss-plugins/issues/439)

### 2.0.0 (June 4, 2022)

- Breaking: use only named exports instead of `default`
- Added: `compare(a, b)` function to compare selectors by specificity

```diff
- `import selectorSpecificity from '@csstools/selector-specificity';`
+ `import { selectorSpecificity } from '@csstools/selector-specificity';`
```

### 1.0.0 (April 26, 2022)

- Initial version
