# Modification

## Methods

### lighten

Increase lightness.

Syntax

``` ts
mooColor.lighten(amount: number): this;
```

- @param `number` amount - The amount from 0 to 100.
- @returns `this`

### darken

Decrease lightness.

Syntax

``` ts
mooColor.darken(amount: number): this;
```

- @param `number` amount - The amount from 0 to 100.
- @returns `this`

### saturate

Increase saturation.

Syntax

``` ts
mooColor.saturate(amount: number): this;
```

- @param `number` amount - The amount from 0 to 100.
- @returns `this`

### desaturate

Decrease saturation.

Syntax

``` ts
mooColor.desaturate(amount: number): this;
```

- @param `number` amount - The amount from 0 to 100.
- @returns `this`

### grayscale

Sets saturation value to 0.

Syntax

``` ts
mooColor.grayscale(): this;
```

- @returns `this`

### whiten

Modify whiteness.

Syntax

``` ts
mooColor.whiten(amount: number): this;
```

- @param `number` amount - The amount from -100 to 100.
- @returns `this`

### blacken

Modify blackness.

Syntax

``` ts
mooColor.blacken(amount: number): this;
```

- @param `number` amount - The amount from -100 to 100.
- @returns `this`

### rotate

Rotate hue value.

Syntax

``` ts
mooColor.rotate(degree: number): this;
```

- @param `number` degree - The degree value from 0 to 360.
- @returns `this`

### mix

Mix two colors.

Syntax

``` ts
const mixedColor = mooColor.mix(color: MooColor, percent?: number): MooColor;
```

- @param `MooColor` color - The color to mixed.
- @param `number` [percent = 50] - The percentage value of color to be mixed.
- @returns `MooColor` - The mixed color that as a new instance of `MooColor`.

### complement

Sets color to the complement of a color. This is identical to `rotate(180)`.

Syntax

``` ts
mooColor.complement(): this;
```

- @returns `this`

### invert

Sets color to the inverse (negative) of a color.

Syntax

``` ts
mooColor.invert(percent?: number): this;
```

- @param `number` [percent = 100] - The relative percent of the color that inverse.
- @returns `this`
