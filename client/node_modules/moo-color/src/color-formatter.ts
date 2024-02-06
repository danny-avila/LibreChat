import {
  AcceptedModel,
  Color,
  ColorRepresentable,
  ColorSettable,
  HexMode,
  RgbMode,
} from './color';
import * as Converter from './color-converter';
import Names from './color-names';
import { arrayIsEqual, decimal, resolveAlpha } from './util/util';

export class ColorFormatter implements ColorSettable, ColorRepresentable {
  color?: Color;
  // In hwb model, whiteness and blackness value's adjust will required.
  protected resolveHwb = Converter.resolveHwb;

  setColor(color: Color): this {
    color.alpha = resolveAlpha(color.alpha);
    this.color = color;
    return this;
  }

  getColor(): Color {
    return this.color;
  }

  getColorAs(model: AcceptedModel): Color {
    return this.color.model === model
      ? this.color
      : this.convert(this.color, model);
  }

  getModel(): AcceptedModel|undefined {
    return this.color ? this.color.model : undefined;
  }

  changeModel(model: AcceptedModel): this {
    return this.color.model === model
      ? this
      : this.setColor(this.convert(this.color, model));
  }

  getAlpha(): number {
    return this.color.alpha;
  }

  setAlpha(alpha: number): this {
    this.color.alpha = alpha;
    return this;
  }

  convert(color: Color, model: AcceptedModel): Color {
    let values: number[];
    switch (color.model) {
      case 'rgb': values = this.convertFromRgb(color.values, model); break;
      case 'hwb': values = this.convertFromHwb(color.values, model); break;
      case 'hsl': values = this.convertFromHsl(color.values, model); break;
      case 'hsv': values = this.convertFromHsv(color.values, model); break;
      case 'cmyk': values = this.convertFromCmyk(color.values, model); break;
    }
    if (!values.length) {
      throw new Error('Converting Error!');
    }
    return { model, values, alpha: color.alpha};
  }

  /**
   * Represents color as notation of specific color model.
   *
   * @param {(AcceptedModel|'hex')} [model] - Specify color model.
   * If not specifying this value, then returns current color model.
   * @param {...any[]} args - Arguments for the represent methods.
   * @returns {string}
   */
  toString(model?: AcceptedModel|'hex', ...args: any[]): string {
    model = model ? model : this.color.model;
    switch (model) {
      case 'hex': return this.toHex(...args);
      case 'hwb': return this.toHwb();
      case 'hsl': return this.toHsl();
      case 'hsv': return this.toHsv();
      case 'cmyk': return this.toCmyk();
      default: return this.toRgb(...args);
    }
  }

  /**
   * Represents color as HEX notation.
   * @see https://www.w3.org/TR/css-color-4/#hex-notation
   *
   * @param {HexMode} [mode='full'] 'full'|'short'|'name'
   * @returns {string}
   */
  toHex(mode: HexMode = 'full'): string {
    const color = this.getColorAs('rgb');
    const [r, g, b] = color.values.map(x => Math.round(x));
    const a = color.alpha === 1 ? null : color.alpha;
    const nameOrShort = () => {
      let name = '';
      for (const key of Object.keys(Names)) {
        if (arrayIsEqual(Names[key], [r, g, b])) {
          name = key; break;
        }
      }
      return a === null && name !== '' ? name : `#${Converter.rgbToHex(r, g, b, a, true)}`;
    };
    switch (mode) {
      case 'name': return nameOrShort();
      case 'short': return `#${Converter.rgbToHex(r, g, b, a, true)}`;
      case 'full':
      default: return `#${Converter.rgbToHex(r, g, b, a)}`;
    }
  }

  /**
   * Represents color as RGB notation.
   * @see https://www.w3.org/TR/css-color-4/#rgb-functions
   *
   * @param {RgbMode} [mode='default'] 'default'|'percent'
   * @returns {string}
   */
  toRgb(mode: RgbMode = 'default'): string {
    const color = this.getColorAs('rgb');
    let [r, g, b]: number[]|string[] = color.values.map(x => Math.round(x));
    if (mode === 'percent') {
      [r, g, b] = [r, g, b].map(x => `${x / 255 * 100}%`);
    }
    return color.alpha === 1
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${color.alpha})`;
  }

  /**
   * Represents color as HWB notation.
   * @see https://www.w3.org/TR/css-color-4/#the-hwb-notation
   * @returns {string} e.g. 'hwb(0, 0%, 0%, 0)'
   */
  toHwb(): string {
    const color = this.getColorAs('hwb');
    const [h, w, b] = color.values.map(x => decimal(x, 2));
    const a = color.alpha === 1 ? '' : `, ${color.alpha}`;
    return `hwb(${h}, ${w}%, ${b}%${a})`;
  }

  /**
   * Represents color as HSL notation.
   * @see https://www.w3.org/TR/css-color-4/#the-hsl-notation
   * @returns {string}
   */
  toHsl(): string {
    const color = this.getColorAs('hsl');
    const [h, s, l] = color.values.map(x => decimal(x, 2));
    return color.alpha === 1
      ? `hsl(${h}, ${s}%, ${l}%)`
      : `hsla(${h}, ${s}%, ${l}%, ${color.alpha})`;
  }

  /**
   * Represents color as HSV notation. This format is similar to HSL.
   * @returns {string}
   */
  toHsv(): string {
    const color = this.getColorAs('hsv');
    const [h, s, v] = color.values.map(x => decimal(x, 2));
    return color.alpha === 1
      ? `hsv(${h}, ${s}%, ${v}%)`
      : `hsva(${h}, ${s}%, ${v}%, ${color.alpha})`;
  }

  /**
   * Represents color as CMYK notation. e.g. 'cmyk(0%, 0%, 0%, 0%)'
   * @see https://www.w3.org/TR/css-color-4/#cmyk-colors
   * @returns {string}
   */
  toCmyk(): string {
    const color = this.getColorAs('cmyk');
    const [c, m, y, k] = color.values.map(x => decimal(x, 2));
    const a = color.alpha === 1 ? '' : `, ${color.alpha}`;
    return `cmyk(${c}%, ${m}%, ${y}%, ${k}%${a})`;
  }

  protected convertFromRgb([r, g, b]: number[], model: AcceptedModel): number[] {
    switch (model) {
      case 'rgb': return [r, g, b];
      case 'hwb': return Converter.rgbToHwb(r, g, b);
      case 'hsl': return Converter.rgbToHsl(r, g, b);
      case 'hsv': return Converter.rgbToHsv(r, g, b);
      case 'cmyk': return Converter.rgbToCmyk(r, g, b);
    }
  }

  protected convertFromHwb([h, w, b]: number[], model: AcceptedModel): number[] {
    const [red, green, blue] = Converter.hwbToRgb(h, w, b);
    switch (model) {
      case 'rgb': return [red, green, blue];
      case 'hwb': return [h, w, b];
      case 'hsl': return Converter.rgbToHsl(red, green, blue);
      case 'hsv': return Converter.hwbToHsv(h, w, b);
      case 'cmyk': return Converter.rgbToCmyk(red, green, blue);
    }
  }

  protected convertFromHsl([h, s, l]: number[], model: AcceptedModel): number[] {
    const [red, green, blue] = Converter.hslToRgb(h, s, l);
    switch (model) {
      case 'rgb': return [red, green, blue];
      case 'hwb': return Converter.rgbToHwb(red, green, blue);
      case 'hsl': return [h, s, l];
      case 'hsv': return Converter.rgbToHsv(red, green, blue);
      case 'cmyk': return Converter.rgbToCmyk(red, green, blue);
    }
  }

  protected convertFromHsv([h, s, v]: number[], model: AcceptedModel): number[] {
    const [red, green, blue] = Converter.hsvToRgb(h, s, v);
    switch (model) {
      case 'rgb': return [red, green, blue];
      case 'hwb': return Converter.hsvToHwb(h, s, v);
      case 'hsl': return Converter.rgbToHsl(red, green, blue);
      case 'hsv': return [h, s, v];
      case 'cmyk': return Converter.rgbToCmyk(red, green, blue);
    }
  }

  protected convertFromCmyk([c, m, y, k]: number[], model: AcceptedModel): number[] {
    const [red, green, blue] = Converter.cmykToRgb(c, m, y, k);
    switch (model) {
      case 'rgb': return [red, green, blue];
      case 'hwb': return Converter.rgbToHwb(red, green, blue);
      case 'hsl': return Converter.rgbToHsl(red, green, blue);
      case 'hsv': return Converter.rgbToHsv(red, green, blue);
      case 'cmyk': return [c, m, y, k];
    }
  }
}

export default ColorFormatter;
