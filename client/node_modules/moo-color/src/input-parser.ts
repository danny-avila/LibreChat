import { Color } from './color';
import { resolveHwb } from './color-converter';
import Names from './color-names';
import { clamp, degree, resolveAlpha } from './util/util';

export default function inputParser(input: string): Color|null {
  if (input in Names) {
    // Named colors.
    return {
      model: 'rgb',
      values: Names[input],
      alpha: 1,
    };
  } else if (input === 'transparent') {
    // 'transparent'.
    return {
      model: 'rgb',
      values: [0, 0, 0],
      alpha: 0,
    };
  } else {
    // parse string.
    const prefix = input.substr(0, 3).toLowerCase();
    switch (prefix) {
      case 'hwb': return parseHwb(input);
      case 'hsl': return parseHsl(input);
      case 'hsv': return parseHsv(input);
      case 'cmy': return parseCmyk(input);
      default: return parseRgb(input);
    }
  }
}

function parseRgb(input: string): Color|null {
  const hex = /^#?([a-f0-9]{6})([a-f0-9]{2})?$/i;
  const shortHex = /^#?([a-f0-9]{3})([a-f0-9]{1})?$/i;
  const rgba = /^rgba?\s*\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/;
  // tslint:disable-next-line:max-line-length
  const percent = /^rgba?\s*\(\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/;
  const hexToAlpha = (num: string) => Math.round((parseInt(num, 16) / 255) * 100) / 100;
  let values: number[];
  let alpha: number;

  if (hex.test(input)) {
    const [, h, a] = input.match(hex);
    values = h.match(/.{2}/g).map(x => parseInt(x, 16));
    alpha = a ? hexToAlpha(a) : 1;
  } else if (shortHex.test(input)) {
    const [, h, a] = input.match(shortHex);
    values = h.match(/.{1}/g).map(x => parseInt(x + x, 16));
    alpha = a ? hexToAlpha(a) : 1;
  } else if (rgba.test(input)) {
    const [, r, g, b, a] = input.match(rgba);
    values = [r, g, b].map(x => parseInt(x, 0));
    alpha = resolveAlpha(a);
  } else if (percent.test(input)) {
    const [, r, g, b, a] = input.match(percent);
    values = [r, g, b].map(x => Math.round(parseFloat(x) * 2.55));
    alpha = resolveAlpha(a);
  } else {
    return null;
  }
  return {
    model: 'rgb',
    values: values.map(x => clamp(x, 0, 255)),
    alpha: clamp(alpha, 0, 1),
  };
}

function parseHsl(input: string): Color|null {
  // tslint:disable-next-line:max-line-length
  const hsl = /^hsla?\s*\(\s*([+-]?\d*[.]?\d+)(?:deg)?\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/i;

  if (hsl.test(input)) {
    const [, h, s, l, a] = input.match(hsl);
    return {
      model: 'hsl',
      values: [
        degree(h),
        clamp(parseFloat(s), 0, 100),
        clamp(parseFloat(l), 0, 100),
      ],
      alpha: resolveAlpha(a),
    };
  } else {
    return null;
  }
}

function parseHwb(input: string): Color|null {
  // tslint:disable-next-line:max-line-length
  const hwb = /^hwba?\s*\(\s*([+-]?\d*[.]?\d+)(?:deg)?\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/i;

  if (hwb.test(input)) {
    const [, h, w, b, a] = input.match(hwb);
    return {
      model: 'hwb',
      values: resolveHwb(
        degree(h),
        clamp(parseFloat(w), 0, 100),
        clamp(parseFloat(b), 0, 100),
      ),
      alpha: resolveAlpha(a),
    };
  } else {
    return null;
  }
}

function parseHsv(input: string): Color|null {
  // tslint:disable-next-line:max-line-length
  const hsv = /^hsva?\s*\(\s*([+-]?\d*[.]?\d+)(?:deg)?\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/i;

  if (hsv.test(input)) {
    const [, h, s, v, a] = input.match(hsv);
    return {
      model: 'hsv',
      values: [
        degree(h),
        clamp(parseFloat(s), 0, 100),
        clamp(parseFloat(v), 0, 100),
      ],
      alpha: resolveAlpha(a),
    };
  } else {
    return null;
  }
}

function parseCmyk(input: string): Color|null {
  // tslint:disable-next-line:max-line-length
  const cmyk = /^cmyk\s*\(\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*,\s*([+-]?[\d.]+)%\s*(?:,\s*([+-]?[\d.]+)\s*)?\)$/i;

  if (cmyk.test(input)) {
    const [, c, m, y, k, a] = input.match(cmyk);
    return {
      model: 'cmyk',
      values: [
        clamp(parseFloat(c), 0, 100),
        clamp(parseFloat(m), 0, 100),
        clamp(parseFloat(y), 0, 100),
        clamp(parseFloat(k), 0, 100),
      ],
      alpha: resolveAlpha(a),
    };
  } else {
    return null;
  }
}
