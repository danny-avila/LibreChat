import DOMPurify from 'dompurify';

/**
 * Heuristics for deciding whether a custom SVG icon is a monochrome glyph that
 * should be tinted to `currentColor` (so it follows the active theme) or a
 * multi-color logo that must keep its original colors.
 */

const COLOR_REGEX =
  /(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-zA-Z]+)/gi;

/** Color keywords that carry no chromatic information and are ignored. */
const IGNORABLE_COLORS = new Set(['none', 'transparent', 'inherit', 'currentcolor']);

/** Named CSS colors that are pure grayscale. Unknown names are treated as chromatic. */
const GRAY_NAMES = new Set([
  'black',
  'white',
  'gray',
  'grey',
  'silver',
  'gainsboro',
  'whitesmoke',
  'lightgray',
  'lightgrey',
  'darkgray',
  'darkgrey',
  'dimgray',
  'dimgrey',
]);

function hexToRgb(hex: string): [number, number, number] | null {
  let value = hex.slice(1);
  if (value.length === 3 || value.length === 4) {
    value = value
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (value.length !== 6 && value.length !== 8) {
    return null;
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }
  return [r, g, b];
}

function functionalToValues(color: string): number[] | null {
  const open = color.indexOf('(');
  const close = color.indexOf(')');
  if (open === -1 || close === -1) {
    return null;
  }
  const parts = color
    .slice(open + 1, close)
    .split(/[,/\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const toNumber = (part: string) =>
    part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part);
  const values = parts.slice(0, 3).map(toNumber);
  return values.some(Number.isNaN) ? null : values;
}

function isGrayscaleColor(color: string): boolean {
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    return rgb ? rgb[0] === rgb[1] && rgb[1] === rgb[2] : false;
  }
  if (color.startsWith('rgb')) {
    const rgb = functionalToValues(color);
    if (!rgb) {
      return false;
    }
    const [r, g, b] = rgb.map(Math.round);
    return r === g && g === b;
  }
  if (color.startsWith('hsl')) {
    const hsl = functionalToValues(color);
    return hsl ? hsl[1] === 0 : false;
  }
  return GRAY_NAMES.has(color);
}

function extractColors(svg: string): string[] {
  const colors: string[] = [];
  COLOR_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null = COLOR_REGEX.exec(svg);
  while (match !== null) {
    const token = match[1].trim().toLowerCase();
    if (token && !IGNORABLE_COLORS.has(token)) {
      colors.push(token);
    }
    match = COLOR_REGEX.exec(svg);
  }
  return colors;
}

const VIEWBOX_REGEX = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i;
const RECT_REGEX = /<rect\b[^>]*>/gi;

function getAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1].trim() : null;
}

function coversCanvas(value: string | null, canvas: number | null): boolean {
  if (value == null) {
    return false;
  }
  if (value.trim() === '100%') {
    return true;
  }
  const size = parseFloat(value);
  if (Number.isNaN(size)) {
    return false;
  }
  return canvas != null && size >= canvas * 0.98;
}

/**
 * Detects a full-canvas opaque background (a `<rect>` at the origin spanning the
 * viewBox). Such SVGs cannot be tinted via a CSS mask, since the opaque
 * background fills the whole area with the tint color instead of the glyph.
 */
function hasOpaqueBackground(svg: string): boolean {
  const viewBox = svg.match(VIEWBOX_REGEX);
  const width = viewBox ? parseFloat(viewBox[1]) : null;
  const height = viewBox ? parseFloat(viewBox[2]) : null;

  const rects = svg.match(RECT_REGEX) ?? [];
  for (const rect of rects) {
    const fill = getAttr(rect, 'fill');
    if (fill === 'none' || fill === 'transparent') {
      continue;
    }
    const fillOpacity = getAttr(rect, 'fill-opacity');
    const opacity = getAttr(rect, 'opacity');
    if (fillOpacity != null && parseFloat(fillOpacity) === 0) {
      continue;
    }
    if (opacity != null && parseFloat(opacity) === 0) {
      continue;
    }
    if (parseFloat(getAttr(rect, 'x') ?? '0') > 0 || parseFloat(getAttr(rect, 'y') ?? '0') > 0) {
      continue;
    }
    if (
      coversCanvas(getAttr(rect, 'width'), width) &&
      coversCanvas(getAttr(rect, 'height'), height)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when an SVG can be safely tinted to match the theme: it only
 * contains grayscale colors (or relies on the default black fill /
 * `currentColor`) and has no opaque background. Multi-color logos and icons with
 * an opaque background return false so they are rendered with their own colors.
 */
export function isMonochromeSvg(svg: string): boolean {
  if (hasOpaqueBackground(svg)) {
    return false;
  }
  const colors = extractColors(svg);
  if (colors.length === 0) {
    return true;
  }
  return colors.every(isGrayscaleColor);
}

/**
 * Strips scripts, event handlers, and other active content from user-provided
 * SVG markup using an allowlist sanitizer, leaving only safe drawing elements.
 */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onmouseenter', 'onfocus'],
  });
}

/** Encodes SVG markup as a URL-encoded `image/svg+xml` data URI. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
