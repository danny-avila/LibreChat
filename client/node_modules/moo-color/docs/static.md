# Static

Static members of MooColor.

## Types

### RandomArguments

``` ts
/** An argument for `random()` method. */
interface RandomArguments {
  /** The hue value from 0 to 360. Also you can give this as range. e.g. [0, 180] */
  hue?: number|[number, number];
  /** The whiteness value from 0 to 100. Also you can give this as range. e.g. [0, 50] */
  white?: number|[number, number];
  /** The blackness value from 0 to 100. Also you can give this as range. e.g. [0, 50] */
  black?: number|[number, number];
}
```

## Methods

### mix

Helper method for [`mix()`](modifier.md#mix) method.

Syntax

``` ts
MooColor.mix(
  color1: MooColor|string|Color, 
  color2: MooColor|string|Color,
  percentOf1?: number
): MooColor;
```

- @param `MooColor|string|Color` color1
- @param `MooColor|string|Color` color2
- @param `number` [percentOf1=50] - percentage of the first color.
- @returns `MooColor` - mixed color.

Examples

``` js
const color1 = new MooColor('#f00');
const color2 = new MooColor('#f80');
const mixedColor = MooColor.mix(color1, color2);

// or simply
const newColor = MooColor.mix('#f00', '#f80');

// If you want to getting mixed as unbalanced, use `percentOf1` parameter.
const myColor = MooColor.mix('green', 'blue', 75);
```

### random

Create random color as HWB model.

Syntax

``` ts
MooColor.random(arg?: RandomArguments): MooColor;
```

- @param [`RandomArguments`](#randomArguments) [{ hue, white, black } = {}]
  - `hue` - The hue value from 0 to 360. Also you can give this as range. e.g. [0, 180]
  - `white` - The whiteness value from 0 to 100. Also you can give this as range. e.g. [0, 50]
  - `black` - The blackness value from 0 to 100. Also you can give this as range. e.g. [0, 50]
- @returns `MooColor`

Examples

``` js
// Make random color. (default)
const color1 = MooColor.random();
// Make random color that specify whiteness and blackness values.
const color2 = MooColor.random({ white: 0, black: 50 });
// Make random color that range between red and yellow (hue value from 0 to 60).
const color3 = MooColor.random({ hue: [0, 60] });
```
