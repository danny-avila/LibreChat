import {
  AcceptedModel,
  Color,
  ColorRepresentable,
  ColorSettable,
  HexMode,
  RgbMode,
} from './color.d';

export class ColorFormatter implements ColorSettable, ColorRepresentable {
  color?: Color;

  setColor(color: Color): this;
  getColor(): Color;
  getColorAs(model: AcceptedModel): Color;
  getModel(): AcceptedModel|undefined;
  changeModel(model: AcceptedModel): this;
  getAlpha(): number;
  setAlpha(alpha: number): this;
  convert(color: Color, m: AcceptedModel): Color;

  /**
   * Represents color as notation of specific color model.
   *
   * @param {(AcceptedModel|'hex')} [model] - Specify color model.
   * If not specifying this value, then returns current color model.
   * @param {...any[]} args - Arguments for the represent methods.
   * @returns {string}
   */
  toString(model?: AcceptedModel|'hex', ...args: any[]): string;

  /**
   * Represents color as HEX notation.
   * @see https://www.w3.org/TR/css-color-4/#hex-notation
   *
   * @param {HexMode} [mode='full'] 'full'|'short'|'name'
   * @returns {string}
   */
  toHex(mode?: HexMode): string;

  /**
   * Represents color as RGB notation.
   * @see https://www.w3.org/TR/css-color-4/#rgb-functions
   *
   * @param {RgbMode} [mode='default'] 'default'|'percent'
   * @returns {string}
   */
  toRgb(mode?: RgbMode): string;

  /**
   * Represents color as HWB notation.
   * @see https://www.w3.org/TR/css-color-4/#the-hwb-notation
   * @returns {string} e.g. 'hwb(0, 0%, 0%, 0)'
   */
  toHwb(): string;

  /**
   * Represents color as HSL notation.
   * @see https://www.w3.org/TR/css-color-4/#the-hsl-notation
   * @returns {string}
   */
  toHsl(): string;

  /**
   * Represents color as HSV notation. This format is similar to HSL.
   * @returns {string}
   */
  toHsv(): string;

  /**
   * Represents color as CMYK notation. e.g. 'cmyk(0%, 0%, 0%, 0%)'
   * @see https://www.w3.org/TR/css-color-4/#cmyk-colors
   * @returns {string}
   */
  toCmyk(): string;
}

export default ColorFormatter;
