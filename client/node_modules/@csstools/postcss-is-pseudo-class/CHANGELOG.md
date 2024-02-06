# Changes to PostCSS Is Pseudo Class

### 3.2.1 (May 19, 2023)

- Fix compound selectors with `*`.

```diff
:is(.a *):is(h1, h2, h3) {}

/* becomes : */

- .a *h1, .a *h2, .a *h3 {}
+ .a h1, .a h2, .a h3 {}
```

### 3.2.0 (April 10, 2023)

- Add support for more complex selector patterns. In particular anything where `:is()` is in the left-most compound selector.

### 3.1.1 (February 8, 2023)

- Reduce the amount of duplicate fallback CSS.

### 3.1.0 (February 2, 2023)

- Fix is pseudo inside a not pseudo (`:not(:is(h1, h2, h3))`)
- Reduce the output size when all selectors are known to be valid

### 3.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 3.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).

### 2.0.7 (July 8, 2022)

- Fix case insensitive matching.

### 2.0.6 (June 23, 2022)

- Fix selector order with any pseudo element.
- Fix transforming pseudo elements in `:is()`. Following the specification pseudo elements are invalid and we now transform to a known invalid pseudo element.
- Add `onPseudoElement` plugin option. Set `{ onPseudoElement: 'warning' }` to receive warnings when this plugin encounters an unprocessable pseudo element.

### 2.0.5 (June 4, 2022)

- Update `@csstools/selector-specificity` (major)

### 2.0.4 (May 17, 2022)

- Fix selector order with `:before` and other pseudo elements.

### 2.0.3 (May 11, 2022)

- Use `@csstools/selector-specificity` for specificity calculations.

### 2.0.2 (April 4, 2022)

- Improved : compound selector order with pseudo elements
- Improved : selector specificity calculation.

### 2.0.1 (March 4, 2022)

- Preserve selector order as much as possible. Fixes issues where pseudo elements `::before` were moved.

### 2.0.0 (January 31, 2022)

- Remove `skip` flag in `onComplexSelectors` option.

If a complex selector is encountered that has no known equivalent, it will always be skipped and preserved now.

The previous behavior was to remove `:is()` even if that broke the selector.

### 1.0.1 (January 17, 2022)

- Fix selector order

### 1.0.0 (January 13, 2022)

- initial release
