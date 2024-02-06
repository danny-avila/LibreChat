import type { Color } from 'types/color';
/**
 * @param {Color} color [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function sRGB_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} sRGB [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 */
export declare function XYZ_D50_to_sRGB(x: Color): Color;
/**
 * @param {Color} color [h, s, l]
 * - Hue as degrees 0..360;
 * - Saturation as number 0..100;
 * - Lightness as number 0..100;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function HSL_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} HSL [r, g, b]
 * - Hue as degrees 0..360;
 * - Saturation as number 0..100;
 * - Lightness as number 0..100;
 */
export declare function XYZ_D50_to_HSL(x: Color): Color;
/**
 * @param {Color} color [h, w, b]
 * - Hue as degrees 0..360;
 * - Whiteness as number 0..100;
 * - Blackness as number 0..100;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function HWB_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} HWB [r, g, b]
 * - Hue as degrees 0..360;
 * - Whiteness as number 0..100;
 * - Blackness as number 0..100;
 */
export declare function XYZ_D50_to_HWB(x: Color): Color;
/**
 * @param {Color} color [l, a, b]
 * - Lightness as number 0..100;
 * - a as number -160..160;
 * - b as number -160..160;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function Lab_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} Lab [r, g, b]
 * - Lightness as number 0..100;
 * - a as number -160..160;
 * - b as number -160..160;
 */
export declare function XYZ_D50_to_Lab(x: Color): Color;
/**
 * @param {Color} color [l, c, h]
 * - Lightness as number 0..100;
 * - Chroma as number 0..230;
 * - Hue as degrees 0..360;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function LCH_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} LCH [r, g, b]
 * - Lightness as number 0..100;
 * - Chroma as number 0..230;
 * - Hue as degrees 0..360;
 */
export declare function XYZ_D50_to_LCH(x: Color): Color;
/**
 * @param {Color} color [l, a, b]
 * - Lightness as number 0..1;
 * - a as number 0..0.5;
 * - b as number 0..0.5;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function OKLab_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} OKLab [r, g, b]
 * - Lightness as number 0..1;
 * - a as number 0..0.5;
 * - b as number 0..0.5;
 */
export declare function XYZ_D50_to_OKLab(x: Color): Color;
/**
 * @param {Color} color [l, c, h]
 * - Lightness as number 0..1;
 * - Chroma as number 0..0.5;
 * - Hue as degrees 0..360;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function OKLCH_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} OKLCH [r, g, b]
 * - Lightness as number 0..1;
 * - Chroma as number 0..0.5;
 * - Hue as degrees 0..360;
 */
export declare function XYZ_D50_to_OKLCH(x: Color): Color;
/**
 * @param {Color} color [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function lin_sRGB_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} linear sRGB [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 */
export declare function XYZ_D50_to_lin_sRGB(x: Color): Color;
/**
 * @param {Color} color [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function a98_RGB_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} a98 sRGB [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 */
export declare function XYZ_D50_to_a98_RGB(x: Color): Color;
/**
 * @param {Color} color [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function P3_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} P3 [r, g, b]
 * - R as number 0..1;
 * - G as number 0..1;
 * - B as number 0..1;
 */
export declare function XYZ_D50_to_P3(x: Color): Color;
/**
 * @param {Color} color [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function rec_2020_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} rec 2020 [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 */
export declare function XYZ_D50_to_rec_2020(x: Color): Color;
/**
 * @param {Color} color [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function ProPhoto_RGB_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} ProPhoto [r, g, b]
 * - Red as number 0..1;
 * - Green as number 0..1;
 * - Blue as number 0..1;
 */
export declare function XYZ_D50_to_ProPhoto(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function XYZ_D65_to_XYZ_D50(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} D65 XYZ [x, y, z]
 */
export declare function XYZ_D50_to_XYZ_D65(x: Color): Color;
/**
 * @param {Color} color [x, y, z]
 * - X as number 0..1;
 * - Y as number 0..1;
 * - Z as number 0..1;
 * @return {Color} D50 XYZ [x, y, z]
 */
export declare function XYZ_D50_to_XYZ_D50(x: Color): Color;
