# MooColor API

### Table of contents

- [Basic](#basic)
  - [Constructor](#constructor)
  - [Parsable color string](#parsable-color-string)
- [Static](#static)
- [Setter](#setter)
- [Formatter](#formatter)
- [State Access](#state-access)
- [Modification](#modification)

## Basic

### Constructor

Syntax

``` js
const color = new MooColor(str = '');
```

- @param `string` str - [parsable color string](#parsable-color-string). If not specify this value, then color set to `#000` (black).
- @returns `MooColor` - Instance of `MooColor`

### Parsable color string

``` js
'red'                           // named color.
'#ff0000'                       // Hex (full)
'#ff000080'                     // Hex (full with alpha)
'#f00'                          // Hex (shorthand)
'#f008'                         // Hex (shorthand with alpha)
'rgb(255, 0, 0)'                // rgb
'rgba(255, 0, 0, 0.5)'          // rgba
'rgb(100%, 0%, 0%)'             // rgb (percent)
'rgba(100%, 0%, 0%, 0.5)'       // rgba (percent)
'hsl(0, 100%, 50%)'             // hsl
'hsla(0, 100%, 50%, 0.5)'       // hsla
'hwb(0, 0%, 0%)'                // hwb
'hwb(0, 0%, 0%, 0.5)'           // hwb with alpha
'hsv(0, 100%, 100%)'            // hsv
'hsv(0, 100%, 100%, 0.5)'       // hsv with alpha
'cmyk(0%, 100%, 100%, 0%)'      // cmyk
'cmyk(0%, 100%, 100%, 0%, 0.5)' // cmyk with alpha
```

## [Static](static.md)

- [mix](static.md#mix): Helper method for [`mix()`](modifier.md#mix) method.
- [random](static.md#random): Create random color as HWB model.

## [Setter](setter.md)

- [setColor](setter.md#setColor): Set color data.
- [getColor](setter.md#getColor): Get color data.
- [getColorAs](setter.md#getColorAs): Get color data as specific color model.
- [getModel](setter.md#getModel): Get color model name.
- [changeModel](setter.md#changeModel): Converts color data to given color model.
- [getAlpha](setter.md#getAlpha): Get alpha value from `Color`.
- [setAlpha](setter.md#setAlpha): Set alpha value to `Color`.

## [Formatter](formatter.md)

- [toString](formatter.md#toString): Represents color as notation of specific color model.
- [toHex](formatter.md#toHex): Represents color as HEX notation.
- [toRgb](formatter.md#toRgb): Represents color as RGB notation.
- [toHwb](formatter.md#toHwb): Represents color as HWB notation.
- [toHsl](formatter.md#toHsl): Represents color as HSL notation.
- [toHsv](formatter.md#toHsv): Represents color as HSV notation. This format is similar to HSL.
- [toCmyk](formatter.md#toCmyk): Represents color as CMYK notation.

## [State access](state-access.md)

- [brightness](state-access.md#brightness): `readonly` Returns color brightness from 0 to 255.
- [isLight](state-access.md#isLight): `readonly` Returns whether color is light or not.
- [isDark](state-access.md#isDark): `readonly` Returns whether color is dark or not.
- [luminance](state-access.md#luminance): `readonly` Returns luminance value of the color. range from 0 to 1.
- [contrastRatioWith](state-access.md#contrastRatioWith): Returns contrast ratio with other color. range from 0 to 21.
- [isContrastEnough](state-access.md#isContrastEnough): Return true if contrast ratio >= 4.5

## [Modification](modification.md)

- [lighten](modification.md#lighten): Increase lightness.
- [darken](modification.md#darken): Decrease darkness.
- [saturate](modification.md#saturate): Increase saturation.
- [desaturate](modification.md#desaturate): Decrease saturation.
- [grayscale](modification.md#grayscale): Sets saturation value to 0.
- [whiten](modification.md#whiten): Modify whiteness.
- [blacken](modification.md#blacken): Modify blackness.
- [rotate](modification.md#rotate): Rotate hue value.
- [mix](modification.md#mix): Mix two colors.
- [complement](modification.md#complement): Sets color to the complement of a color.
- [invert](modification.md#invert): Sets color to the inverse (negative) of a color.
