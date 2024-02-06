# State access

## Readonly

### brightness

Returns color brightness from 0 to 255. (It based RGB)

> [Color contrast](https://www.w3.org/TR/AERT/#color-contrast)

Syntax

``` ts
mooColor.brightness: number;
```

- @returns `number` - 0-255

### isLight

Returns whether color is light or not.

Syntax

``` ts
mooColor.isLight: boolean;
```

- @returns `boolean`

### isDark

Returns whether color is dark or not.

Syntax

``` ts
mooColor.isDark: boolean;
```

- @returns `boolean`

### luminance

Returns luminance value of the color. range from 0 to 1.

> [Relative luminance](https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef)

Syntax

``` ts
mooColor.luminance: number;
```

- @returns `number` - 0 to 1.

## Methods

### contrastRatioWith

Returns contrast ratio with other color. range from 0 to 21.

> [Relative luminance](https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef)

Syntax

``` ts
mooColor.contrastRatioWith(color: Color): number;
```

- @param [`Color`](setter.md#color-data) color - The target color for compare.
- @returns `number` - 0 to 21.

### isContrastEnough

Return true if contrast ratio >= 4.5

> [Contrast (minimum)](https://www.w3.org/WAI/WCAG20/quickref/#qr-visual-audio-contrast-contrast)

Syntax

``` ts
mooColor.isContrastEnough(color: Color): boolean;
```

- @param [`Color`](setter.md#color-data) color - The target color for compare.
- @returns `boolean`
