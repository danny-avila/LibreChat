import { padStart } from './util/util';

/**
 * Converts an HSL to RGB.
 * @see https://www.rapidtables.com/convert/color/hsl-to-rgb.html
 * @export
 * @param {number} h hue
 * @param {number} s saturation 0-100
 * @param {number} l lightness 0-100
 * @returns {number[]} [red, green, blue] 0-255
 */
export function hslToRgb(h: number, s: number, l: number): number[] {
  h /= 60, s /= 100, l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h % 2 - 1));
  const m = l - c / 2;
  let r;
  let g;
  let b;
  switch (Math.floor(h)) {
    case 0: r = c, g = x, b = 0; break;
    case 1: r = x, g = c, b = 0; break;
    case 2: r = 0, g = c, b = x; break;
    case 3: r = 0, g = x, b = c; break;
    case 4: r = x, g = 0, b = c; break;
    case 5: r = c, g = 0, b = x; break;
  }
  return [r, g, b].map(val => (val + m) * 255);
}

/**
 * Converts RGB to HSL.
 * @see https://www.rapidtables.com/convert/color/rgb-to-hsl.html
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @returns {number[]} [hue, saturation, lightness] (0-360, 0-100, 0-100)
 */
export function rgbToHsl(r: number, g: number, b: number): number[] {
  r /= 255, g /= 255, b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h;
  if (delta === 0) {
    h = 0;
  } else if (max === r) {
    h = 60 * ((g - b) / delta % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / delta + 2);
  } else {
    h = 60 * ((r - g) / delta + 4);
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return [h, s * 100, l * 100];
}

/**
 * Converts HWB to RGB.
 * @export
 * @param {number} hue hue 0-360
 * @param {number} white whiteness 0-100
 * @param {number} black blackness 0-100
 * @returns {number[]} [red, green, blue] 0-255
 */
export function hwbToRgb(hue: number, white: number, black: number): number[] {
  const [h, s, v] = hwbToHsv(hue, white, black);
  return hsvToRgb(h, s, v);
}

/**
 * Converts RGB to HWB.
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @returns {number[]} [hue, whiteness, blackness] (0-360, 0-100, 0-100)
 */
export function rgbToHwb(r: number, g: number, b: number): number[] {
  const [h, s, v] = rgbToHsv(r, g, b);
  return hsvToHwb(h, s, v);
}

/**
 * Converts CMYK to RGB.
 * @see https://www.rapidtables.com/convert/color/cmyk-to-rgb.html
 * @export
 * @param {number} c cyan 0-100
 * @param {number} m magenta 0-100
 * @param {number} y yellow 0-100
 * @param {number} k black 0-100
 * @returns {number[]} [red, green, blue] 0-255
 */
export function cmykToRgb(c: number, m: number, y: number, k: number): number[] {
  c /= 100, m /= 100, y /= 100, k /= 100;
  const red = 255 * (1 - c) * (1 - k);
  const green = 255 * (1 - m) * (1 - k);
  const blue = 255 * (1 - y) * (1 - k);
  return [red, green, blue];
}

/**
 * Converts RGB to CMYK
 * @see https://www.rapidtables.com/convert/color/rgb-to-cmyk.html
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @returns {number[]} [cyan, magenta, yellow, black] 0-100
 */
export function rgbToCmyk(r: number, g: number, b: number): number[] {
  r /= 255, g /= 255, b /= 255;
  const k = 1 - Math.max(r, g, b);
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return [c, m, y, k].map(x => x * 100);
}

/**
 * Converts HSV to RGB.
 * @see https://www.rapidtables.com/convert/color/hsv-to-rgb.html
 * @export
 * @param {number} h hue 0-360
 * @param {number} s saturation 0-100
 * @param {number} v value 0-100
 * @returns {number[]} [red, green, blue] 0-255
 */
export function hsvToRgb(h: number, s: number, v: number): number[] {
  s /= 100; v /= 100;
  let r;
  let g;
  let b;
  const i = h / 60;
  const c = v * s;
  const x = c * (1 - Math.abs(i % 2 - 1));
  const m = v - c;
  switch (Math.floor(i)) {
    case 0: r = c, g = x, b = 0; break;
    case 1: r = x, g = c, b = 0; break;
    case 2: r = 0, g = c, b = x; break;
    case 3: r = 0, g = x, b = c; break;
    case 4: r = x, g = 0, b = c; break;
    case 5: r = c, g = 0, b = x; break;
  }
  return [r, g, b].map(val => (val + m) * 255);
}

/**
 * Converts RGB to HSV.
 * @see https://www.rapidtables.com/convert/color/rgb-to-hsv.html
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @returns {number[]} [hue, saturation, value] (0-360, 0-100, 0-100)
 */
export function rgbToHsv(r: number, g: number, b: number): number[] {
  r /= 255, g /= 255, b /= 255;
  let h;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) {
    h = 0;
  } else if (max === r) {
    h = 60 * ((g - b) / delta % 6);
  } else if (max === g) {
    h = 60 * ((b - r) / delta + 2);
  } else {
    h = 60 * ((r - g) / delta + 4);
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return [h, s * 100, v * 100];
}

/**
 * Converts HSV to HWB
 * @see https://en.wikipedia.org/wiki/HWB_color_model
 * @export
 * @param {number} h hue 0-360
 * @param {number} s saturation 0-100
 * @param {number} v value 0-100
 * @returns {number[]} [hue, whiteness, blackness] (0-360, 0-100, 0-100)
 */
export function hsvToHwb(h: number, s: number, v: number): number[] {
  s /= 100, v /= 100;
  const white = (1 - s) * v;
  const black = 1 - v;
  return [h, white * 100, black * 100];
}

/**
 * Converts HWB to HSV.
 * @see https://en.wikipedia.org/wiki/HWB_color_model
 * @export
 * @param {number} h hue 0-360
 * @param {number} w whiteness 0-100
 * @param {number} b blackness 0-100
 * @returns {number[]} [hue, saturation, value] (0-360, 0-100, 0-100)
 */
export function hwbToHsv(h: number, w: number, b: number): number[] {
  [h, w, b] = resolveHwb(h, w, b);
  w /= 100, b /= 100;
  const s = 1 - w / (1 - b);
  const v = 1 - b;
  return [h, s * 100, v * 100];
}

/**
 * Converts RGB to HEX string.
 * @export
 * @param {number} r red 0-255
 * @param {number} g green 0-255
 * @param {number} b blue 0-255
 * @param {(number|null)} [a] alpha 0-1 or null
 * @param {boolean} [enableShort] enable shorthand, default is false.
 * @returns {string} Hex string. e.g. 'ff0000'
 */
export function rgbToHex(r: number, g: number, b: number, a?: number|null, enableShort?: boolean): string {
  const arr = [r, g, b];
  if (typeof a === 'number') {
    arr.push(Math.round(a * 255));
  }
  const hex = arr.map(x => padStart(x.toString(16), 2, '0')).join('');
  return enableShort ? hexToShorthand(hex) : hex;
}

function hexToShorthand(hex: string): string {
  let check = true;
  const rgb = hex.match(/.{2}/g);
  rgb.forEach(x => {
    if (!x.match(/(.)\1+/)) {
      check = false;
    }
  });
  return check ? rgb.map(x => x.substring(1)).join('') : hex;
}

/**
 * Converts HEX string to RGB.
 * @export
 * @param {string} hex hex string. e.g. 'ff0000', 'f00', 'ff000080'
 * @returns {number[]} [red, green, blue, alpha?] (rgb: 0-255, alpha: 0-1)
 */
export function hexToRgb(hex: string): number[] {
  const short = /^#?([a-f\d])([a-f\d])([a-f\d])([a-f\d])?$/i;
  return hex.replace(short, (m, r, g, b, a) => {
    a = typeof a === 'undefined' ? '' : a;
    return r + r + g + g + b + b + a + a;
  })
  .match(/.{2}/g)
  .map((x, i) => i !== 3 ? parseInt(x, 16) : parseInt(x, 16) / 255);
}

/**
 * Resolve HWB values.
 * @see https://drafts.csswg.org/css-color/#the-hwb-notation
 * @export
 * @param {number} h hue 0-360
 * @param {number} w whiteness 0-100
 * @param {number} b blackness 0-100
 * @returns {number[]} [hue, whiteness, blackness]
 */
export function resolveHwb(h: number, w: number, b: number): number[] {
  const total = w + b;
  if (total > 100) {
    w = Number((w / total).toFixed(4)) * 100;
    b = Number((b / total).toFixed(4)) * 100;
  }
  return [h, w, b];
}
