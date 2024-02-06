import type { Color } from 'types/color';
/**
 * Convert an array of gamma-corrected sRGB values in the 0.0 to 1.0 range to HWB.
 *
 * @param {Color} RGB [r, g, b]
 * - Red component 0..1
 * - Green component 0..1
 * - Blue component 0..1
 * @return {number[]} Array of HWB values
 */
export declare function sRGB_to_HWB(RGB: Color): Color;
