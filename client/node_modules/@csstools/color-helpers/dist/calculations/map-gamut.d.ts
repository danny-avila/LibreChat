import type { Color } from 'types/color';
export declare function mapGamut(startOKLCH: Color, toDestination: (x: Color) => Color, fromDestination: (x: Color) => Color): Color;
