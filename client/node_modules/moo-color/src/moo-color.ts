import {
  AcceptedModel,
  Color,
  ColorModifiable,
  ColorStateAccessible,
  RandomArguments,
} from './color';
import { resolveHwb } from './color-converter';
import ColorFormatter from './color-formatter';
import parser from './input-parser';
import {
  clamp,
  degree,
  getRandom,
} from './util/util';

export * from './color';

export { ColorFormatter };

type manipulateFn = (...args: number[]) => number[];

export class MooColor extends ColorFormatter implements ColorModifiable<MooColor>, ColorStateAccessible {

  static mix(color1: MooColor|string|Color, color2: MooColor|string|Color, percentOf1: number = 50): MooColor {
    const c1 = (color1 instanceof MooColor) ? color1 : new MooColor(color1);
    const c2 = (color2 instanceof MooColor) ? color2 : new MooColor(color2);
    return c2.mix(c1, percentOf1);
  }

  /**
   * Create random color as HWB color model.
   *
   * @static
   * @param {RandomArguments} [{hue, white, black}={}]
   * @returns {MooColor}
   * @memberof MooColor
   */
  static random({hue, white, black}: RandomArguments = {}): MooColor {
    [hue, white, black] = [hue, white, black].map((x, i) => {
      if (typeof x === 'number') {
        return x;
      } else if (Array.isArray(x)) {
        const precision = i === 0 ? 0 : 2;
        return getRandom(Math.min(...x), Math.max(...x), precision);
      } else {
        return i === 0 ? getRandom(0, 360) : getRandom(0, 100, 2);
      }
    });
    return new MooColor({
      model: 'hwb',
      values: resolveHwb(degree(hue), clamp(white, 0, 100), clamp(black, 0, 100)),
      alpha: 1,
    });
  }

  /**
   * Creates an instance of MooColor.
   * @param {(string|Color)} [color] color value. e.g. '#ff0000' 'rgba(255, 0, 0, .5)' 'hsl(120, 50%, 100%)'
   * @memberof MooColor
   */
  constructor(color?: string|Color) {
    super();
    if (typeof color === 'object' && color !== null) {
      this.setColor(color as Color);
    } else if (typeof color === 'string' || typeof color === 'undefined') {
      color = color ? color : '#000';
      this.setColorByParser(color as string);
    }
  }

  setColorByParser(str: string): this {
    const color: Color = parser(str);
    if (!color) {
      throw new Error('parsing error!');
    }
    return this.setColor(color);
  }

  clone(): MooColor {
    return new MooColor(this.color);
  }

  /**
   * Returns color brightness from 0 to 255. (It based RGB)
   * @see https://www.w3.org/TR/AERT/#color-contrast
   * @readonly
   * @type {number}
   */
  get brightness(): number {
    const [r, g, b] = this.getColorAs('rgb').values;
    return ((r * 299) + (g * 587) + (b * 114)) / 1000;
  }

  /**
   * Returns whether color is light or not.
   * @readonly
   * @type {boolean}
   */
  get isLight(): boolean {
    return this.brightness >= 128;
  }

  /**
   * Returns whether color is dark or not.
   * @readonly
   * @type {boolean}
   */
  get isDark(): boolean {
    return this.brightness < 128;
  }

  /**
   * Returns luminance value of the color. value from 0 to 1.
   * @see https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
   * @readonly
   * @type {number}
   */
  get luminance(): number {
    const [r, g, b] = this.getColorAs('rgb').values.map(x => x / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Returns contrast ratio with other color. range from 0 to 21.
   * @see https://www.w3.org/TR/2008/REC-WCAG20-20081211/#relativeluminancedef
   * @param {MooColor} color
   * @returns {number} 0-21
   */
  contrastRatioWith(color: MooColor): number {
    const max = Math.max(this.luminance, color.luminance);
    const min = Math.min(this.luminance, color.luminance);
    return (max + 0.05) / (min + 0.05);
  }

  /**
   * Return true if contrast ratio >= 4.5
   * @see https://www.w3.org/WAI/WCAG20/quickref/#qr-visual-audio-contrast-contrast
   * @param {MooColor} color
   * @returns {boolean}
   */
  isContrastEnough(color: MooColor): boolean {
    return this.contrastRatioWith(color) >= 4.5;
  }

  /**
   * Increase lightness.
   * @param {number} amount The amount from 0 to 100.
   * @returns {this}
   */
  lighten(amount: number): this {
    return this.manipulate('hsl', (h, s, l) => {
      l = clamp(l + amount, 0, 100);
      return [h, s, l];
    });
  }

  /**
   * Decrease lightness.
   * @param {number} amount The amount from 0 to 100.
   * @returns {this}
   */
  darken(amount: number): this {
    return this.manipulate('hsl', (h, s, l) => {
      l = clamp(l - amount, 0, 100);
      return [h, s, l];
    });
  }

  /**
   * Increase saturation.
   * @param {number} amount The amount from 0 to 100.
   * @returns {this}
   */
  saturate(amount: number): this {
    return this.manipulate('hsl', (h, s, l) => {
      s = clamp(s + amount, 0, 100);
      return [h, s, l];
    });
  }

  /**
   * Decrease saturation.
   * @param {number} amount The amount from 0 to 100.
   * @returns {this}
   */
  desaturate(amount: number): this {
    return this.manipulate('hsl', (h, s, l) => {
      s = clamp(s - amount, 0, 100);
      return [h, s, l];
    });
  }

  /**
   * Sets saturation value to 0.
   * @returns {this}
   */
  grayscale(): this {
    return this.manipulate('hsl', (h, s, l) => [h, 0, l]);
  }

  /**
   * Modify whiteness.
   * @param {number} amount The amount from -100 to 100.
   * @returns {this}
   */
  whiten(amount: number): this {
    return this.manipulate(
      'hwb',
      (h, w, b) => this.resolveHwb(h, clamp(w + amount, 0, 100), b),
    );
  }

  /**
   * Modify blackness.
   * @param {number} amount The amount from -100 to 100.
   * @returns {this}
   */
  blacken(amount: number): this {
    return this.manipulate(
      'hwb',
      (h, w, b) => this.resolveHwb(h, w, clamp(b + amount, 0, 100)),
    );
  }

  /**
   * Rotate hue value.
   * @param {number} d degree 0-360
   * @returns {this}
   */
  rotate(d: number): this {
    return this.manipulate('hsl', (h, s, l) => [degree(h + d), s, l]);
  }

  /**
   * Mix two colors.
   * @param {MooColor} color The color to mixed.
   * @param {number} [percent=50] The percentage value of color to be mixed.
   * @returns {MooColor} The mixed color that as a new instance of `MooColor`.
   */
  mix(color: MooColor, percent: number = 50): MooColor {
    percent /= 100;
    const m = this.getModel();
    const c1 = this.getColorAs('rgb');
    const c2 = color.getColorAs('rgb');
    return new MooColor({
      model: 'rgb',
      values: c1.values.map((v, i) => v + (c2.values[i] - v) * percent),
      alpha: c1.alpha + (c2.alpha - c1.alpha) * percent,
    }).changeModel(m);
  }

  /**
   * Sets color to the complement of a color.
   *
   * @returns {this}
   */
  complement(): this {
    return this.manipulate('hsl', (h, s, l) => [degree(h + 180), s, l]);
  }

  /**
   * Sets color to the inverse (negative) of a color.
   *
   * @param {number} [percent=100] The relative percent of the color that inverse.
   * @returns {this}
   */
  invert(percent: number = 100): this {
    percent /= 100;
    const absRound = (x: number) => Math.round(Math.abs(x));
    return this.manipulate('rgb', (r, g, b) => [r, g, b].map(x => absRound(255 * percent - x)));
  }

  protected manipulate(asModel: AcceptedModel, callback: manipulateFn): this {
    const m = this.color.model;
    const color = this.getColorAs(asModel);
    color.values = callback(...color.values);
    return this.setColor(color).changeModel(m);
  }
}

export default MooColor;
