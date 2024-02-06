# Changes to PostCSS Progressive Custom Properties

### 2.3.0 (June 1, 2023)

- Add support for regular properties whose values contain `var()`

```css
.property-with-var--1 {
	color: rgba(87, 107, 149, var(--opacity));
	color: rgb(87 107 149 / var(--opacity));
}

/* becomes */
.property-with-var--1 {
	color: rgba(87, 107, 149, var(--opacity));
}

@supports (color: rgb(0 0 0 / 0)) and (top: var(--f)) {
	.property-with-var--1 {
		color: rgb(87 107 149 / var(--opacity));
	}
}
```

### 2.2.0 (May 19, 2023)

- Add relative color syntax support.
- Fix false positive matches for `rgb` and `hsl` modern function notations.

### 2.1.1 (March 25, 2023)

- Smaller `@supports` check for `color-mix`.

### 2.1.0 (February 2, 2023)

- Group support rules with the same params to reduce the output size.

### 2.0.1 (January 28, 2023)

- Improve `types` declaration in `package.json`

### 2.0.0 (January 24, 2023)

- Updated: Support for Node v14+ (major).

## 1.3.0 (March 7, 2022)

- Add matching rules for `color-mix`
- Fix matching rules for gradient functions
- Reduce matchers size

## 1.2.0 (February 15, 2022)

- More matching rules for [double position gradients](https://github.com/csstools/postcss-plugins/tree/main/plugins/postcss-double-position-gradients#readme).

## 1.1.0 (February 12, 2022)

- No longer uses custom properties in `@supports` rules.
- Implement AST matching for values and units and generate minimal `@supports` for select features.

## 1.0.0 (February 6, 2022)

Initial release
