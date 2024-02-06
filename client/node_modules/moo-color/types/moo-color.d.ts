import {
  AcceptedModel,
  Color,
  ColorModifiable,
  ColorStateAccessible,
  RandomArguments,
} from './color';
import ColorFormatter from './color-formatter';

export as namespace MooColor;

export * from './color';

export {
  AcceptedModel,
  ColorFormatter,
};

type manipulateFn = (...args: number[]) => number[];

export class MooColor extends ColorFormatter implements ColorModifiable<MooColor>, ColorStateAccessible {

  /**
   * Helper method for `mix()`.
   *
   * @static
   * @param {(string|MooColor)} color1
   * @param {(string|MooColor)} color2
   * @param {number} [percentOf1]
   * @returns {MooColor}
   * @memberof MooColor
   */
  static mix(color1: string|MooColor, color2: string|MooColor, percentOf1?: number): MooColor;

  /**
   * Create random color as HWB color model.
   *
   * @static
   * @param {RandomArguments} [arg]
   * @returns {MooColor}
   * @memberof MooColor
   */
  static random(arg?: RandomArguments): MooColor;

  /**
   * Returns color brightness from 0 to 255. (It based RGB)
   * @see https://www.w3.org/TR/AERT/#color-contrast
   * @readonly
   * @type {number}
   */
  readonly brightness: number;

  /**
   * Returns whether color is dark or not.
   * @readonly
   * @type {boolean}
   */
  readonly isDark: boolean;

  /**
   * Returns whether color is light or not.
   * @readonly
   * @type {boolean}
   */
  readonly isLight: boolean;

  /**
   * Returns luminance value of the color. value from 0 to 1.
   * @see https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
   * @readonly
   * @type {number}
   */
  readonly luminance: number;

  /**
   * Creates an instance of MooColor.
   * @param {(string|Color)} [color] color value. e.g. '#ff0000' 'rgba(255, 0, 0, .5)' 'hsl(120, 50%, 100%)'
   * @memberof MooColor
   */
  constructor(color?: string|Color);

  setColorByParser(str: string): this;
  clone(): MooColor;

  /**
   * Returns contrast ratio with other color. range from 0 to 21.
   * @see https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
   * @param {MooColor} color
   * @returns {number} 0-21
   */
  contrastRatioWith(color: MooColor): number;

  /**
   * Return true if contrast ratio >= 4.5
   * @see https://www.w3.org/WAI/WCAG20/quickref/#qr-visual-audio-contrast-contrast
   * @param {MooColor} color
   * @returns {boolean}
   */
  isContrastEnough(color: MooColor): boolean;

  /**
   * Increase lightness.
   * @param {number} amount The amount from 0 to 100.
   * @returns {this}
   */
  lighten(amount: number): this;

  /**
   * Decrease lightness.
   * @param {number} amount The amount from 0 to 100.
   * @returns {this}
   */
  darken(amount: number): this;

  /**
   * Increase saturation.
   * @param {number} amount The amount from 0 to 100.
   * @returns {this}
   */
  saturate(amount: number): this;

  /**
   * Decrease saturation.
   * @param {number} amount The amount from 0 to 100.
   * @returns {this}
   */
  desaturate(amount: number): this;

  /**
   * Set saturation to 0.
   * @returns {this}
   */
  grayscale(): this;

  /**
   * Modify whiteness.
   * @param {number} amount The amount from -100 to 100.
   * @returns {this}
   */
  whiten(amount: number): this;

  /**
   * Modify blackness.
   * @param {number} amount The amount from -100 to 100.
   * @returns {this}
   */
  blacken(amount: number): this;

  /**
   * Rotate hue value.
   * @param {number} d degree 0-360
   * @returns {this}
   */
  rotate(d: number): this;

  /**
   * Mix two colors.
   * @param {MooColor} color The color to mixed.
   * @param {number} [percent=50] The percentage value of color to be mixed.
   * @returns {MooColor} The mixed color that as a new instance of `MooColor`.
   */
  mix(color: MooColor, percent?: number): MooColor;

  /**
   * Sets color to the complement of a color.
   *
   * @returns {this}
   */
  complement(): this;

  /**
   * Sets color to the inverse (negative) of a color.
   *
   * @param {number} [percent=100] The relative percent of the color that inverse.
   * @returns {this}
   */
  invert(percent?: number): this;
}

export default MooColor;
