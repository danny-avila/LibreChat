# Setter

## Declarations

### Color data

A data object that includes color data.

``` ts
type Color = ColorData;
interface ColorData {
  model: AcceptedModel; // 'rgb'|'hwb'|'hsl'|'hsv'|'cmyk'
  values: number[];     // e.g. if rgb: [255, 255, 255], if cmyk: [100, 100, 0, 100]
  alpha?: number;       // The opacity value from 0 to 1.
}
```

## Methods

### setColor

Set color data.

Syntax

``` ts
mooColor.setColor(color: Color): this;
```

- @param `Color` color - [Color data](#color-data)
- @returns `this`

### getColor

Get color data.

Syntax

``` ts
mooColor.getColor(): Color;
```

- @returns `Color` - [Color data](#color-data)

### getColorAs

Get color data as specific color model.

Syntax

``` ts
mooColor.getColorAs(model: string): Color;
```

- @param `string` model - accepted model name. `rgb`|`hwb`|`hsl`|`hsv`|`cmyk`
- @returns `Color` - [Color data](#color-data)

### getModel

Get color model name.

Syntax

``` ts
mooColor.getModel(): string;
```

- @returns `string` - model name. `rgb`|`hwb`|`hsl`|`hsv`|`cmyk`

### changeModel

Converts color data to given color model.

Syntax

``` ts
mooColor.changeModel(model: string): this;
```

- @param `string` model - accepted model name. `rgb`|`hwb`|`hsl`|`hsv`|`cmyk`
- @returns `this`

### getAlpha

Get alpha value from `Color`.

Syntax

``` ts
mooColor.getAlpha(): number;
```

- @returns `number` - alpha value from 0 to 1.

### setAlpha

Set alpha value to `Color`.

Syntax

``` ts
mooColor.setAlpha(alpha: number): this;
```

- @param `number` alpha - alpha value from 0 to 1.
- @returns `this`
