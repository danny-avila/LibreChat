import DOMPurify from 'dompurify';

/**
 * Heuristics for deciding whether a custom SVG icon is a monochrome glyph that
 * should be tinted to `currentColor` (so it follows the active theme) or a
 * multi-color logo / embedded raster that must keep its original colors. The SVG
 * is parsed with `DOMParser` and its elements are inspected, rather than scraped
 * with regexes.
 */

/** Color keywords that carry no chromatic information and are ignored. */
const IGNORABLE_COLORS = new Set(['none', 'transparent', 'inherit', 'currentcolor']);

/** Named CSS grayscale colors mapped to their 0-255 level. Unknown names are chromatic. */
const GRAY_LEVELS = new Map<string, number>([
  ['black', 0],
  ['white', 255],
  ['gray', 128],
  ['grey', 128],
  ['silver', 192],
  ['gainsboro', 220],
  ['whitesmoke', 245],
  ['lightgray', 211],
  ['lightgrey', 211],
  ['darkgray', 169],
  ['darkgrey', 169],
  ['dimgray', 105],
  ['dimgrey', 105],
]);

/** Paint properties whose color values determine whether an SVG is monochrome. */
const PAINT_PROPS = ['fill', 'stroke', 'stop-color'];

/** Area shapes that render with SVG's default black fill when none is supplied. */
const FILLABLE_SHAPES = 'path, rect, circle, ellipse, polygon, text';

/** Containers whose descendants are templates and never render on their own. */
const NON_RENDERING = new Set(['defs', 'clippath', 'mask', 'symbol', 'marker', 'pattern']);

/** Matches color declarations inside a `<style>` block. */
const CSS_COLOR_REGEX = /(?:fill|stroke|stop-color|color)\s*:\s*([^;}]+)/gi;

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

/** Returns the 0-255 gray level of a grayscale color, or null when it is chromatic. */
function grayLevel(color: string): number | null {
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    return rgb && rgb[0] === rgb[1] && rgb[1] === rgb[2] ? rgb[0] : null;
  }
  if (color.startsWith('rgb')) {
    const rgb = functionalToValues(color);
    if (!rgb) {
      return null;
    }
    const [r, g, b] = rgb.map(Math.round);
    return r === g && g === b ? r : null;
  }
  if (color.startsWith('hsl')) {
    const hsl = functionalToValues(color);
    if (!hsl) {
      return null;
    }
    return hsl[1] === 0 ? Math.round(hsl[2]) : null;
  }
  const named = GRAY_LEVELS.get(color);
  return named === undefined ? null : named;
}

function parseSvgRoot(svg: string): Element | null {
  if (typeof DOMParser === 'undefined') {
    return null;
  }
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    return null;
  }
  const root = doc.documentElement;
  return root != null && root.nodeName.toLowerCase() === 'svg' ? root : null;
}

/** Reads a paint value (e.g. `fill`), preferring an inline `style` over the attribute. */
function readPaint(el: Element, prop: string): string | null {
  const style = el.getAttribute('style');
  if (style) {
    for (const declaration of style.split(';')) {
      const separator = declaration.indexOf(':');
      if (separator !== -1 && declaration.slice(0, separator).trim().toLowerCase() === prop) {
        return declaration.slice(separator + 1).trim();
      }
    }
  }
  return el.getAttribute(prop);
}

function readDimension(el: Element, name: string): number | null {
  const value = el.getAttribute(name);
  if (value == null) {
    return null;
  }
  const size = parseFloat(value);
  return Number.isNaN(size) ? null : size;
}

function canvasSize(root: Element): { width: number | null; height: number | null } {
  const viewBox = root.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every((part) => !Number.isNaN(part))) {
      return { width: parts[2], height: parts[3] };
    }
  }
  return { width: readDimension(root, 'width'), height: readDimension(root, 'height') };
}

function spansCanvas(value: string | null, canvas: number | null): boolean {
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

function isOpaqueRect(rect: Element): boolean {
  const fill = (readPaint(rect, 'fill') ?? '').trim().toLowerCase();
  if (fill === 'none' || fill === 'transparent') {
    return false;
  }
  const fillOpacity = rect.getAttribute('fill-opacity');
  if (fillOpacity != null && parseFloat(fillOpacity) === 0) {
    return false;
  }
  const opacity = rect.getAttribute('opacity');
  if (opacity != null && parseFloat(opacity) === 0) {
    return false;
  }
  return true;
}

/**
 * A full-canvas opaque `<rect>` at the origin cannot be tinted via a CSS mask:
 * the mask uses alpha, so an opaque background fills the whole area with the
 * tint color instead of the glyph.
 */
function hasOpaqueBackground(root: Element): boolean {
  const { width, height } = canvasSize(root);
  for (const rect of Array.from(root.querySelectorAll('rect'))) {
    if (!isOpaqueRect(rect)) {
      continue;
    }
    if ((readDimension(rect, 'x') ?? 0) > 0 || (readDimension(rect, 'y') ?? 0) > 0) {
      continue;
    }
    if (
      spansCanvas(rect.getAttribute('width'), width) &&
      spansCanvas(rect.getAttribute('height'), height)
    ) {
      return true;
    }
  }
  return false;
}

function colorsFromStyleBlocks(root: Element): string[] {
  const colors: string[] = [];
  for (const style of Array.from(root.querySelectorAll('style'))) {
    const css = style.textContent ?? '';
    CSS_COLOR_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null = CSS_COLOR_REGEX.exec(css);
    while (match !== null) {
      colors.push(match[1]);
      match = CSS_COLOR_REGEX.exec(css);
    }
  }
  return colors;
}

function collectColors(root: Element): string[] {
  const colors: string[] = [];
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (el.nodeName.toLowerCase() === 'style') {
      continue;
    }
    for (const prop of PAINT_PROPS) {
      const value = readPaint(el, prop);
      if (value) {
        colors.push(value);
      }
    }
  }
  colors.push(...colorsFromStyleBlocks(root));
  return colors
    .map((color) => color.trim().toLowerCase())
    .filter((color) => color.length > 0 && !IGNORABLE_COLORS.has(color));
}

/** True when the element or any ancestor sets an explicit `fill` (inherited by SVG). */
function inheritsExplicitFill(el: Element): boolean {
  let current: Element | null = el;
  while (current != null) {
    const fill = readPaint(current, 'fill');
    if (fill != null && fill.trim() !== '') {
      return true;
    }
    if (current.nodeName.toLowerCase() === 'svg') {
      break;
    }
    current = current.parentElement;
  }
  return false;
}

function inNonRenderingContainer(el: Element, root: Element): boolean {
  let current = el.parentElement;
  while (current != null && current !== root) {
    if (NON_RENDERING.has(current.nodeName.toLowerCase())) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * True when a rendered shape paints with SVG's default black fill: it has no
 * explicit fill or stroke, inherits no fill from an ancestor, and is not a
 * non-rendering template. Such a shape contributes a black tone that explicit
 * paint values alone do not capture. Skipped when a `<style>` block is present,
 * since a CSS rule may color the shape and cannot be resolved without matching.
 */
function hasDefaultBlackShape(root: Element): boolean {
  if (root.querySelector('style') != null) {
    return false;
  }
  for (const el of Array.from(root.querySelectorAll(FILLABLE_SHAPES))) {
    if (readPaint(el, 'fill') != null || readPaint(el, 'stroke') != null) {
      continue;
    }
    if (inheritsExplicitFill(el) || inNonRenderingContainer(el, root)) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Returns true when an SVG can be safely tinted to match the theme: it embeds no
 * raster (`<image>`) or foreign (`<foreignObject>`) content, has no opaque
 * background, and resolves to a single grayscale tone (or relies on the default
 * black fill / `currentColor`). Anything with a second tone (a background shape,
 * an accent, or a second shade), a chromatic color, or that is unparseable
 * returns false, since a CSS mask would flatten it to a solid block.
 */
export function isMonochromeSvg(svg: string): boolean {
  const root = parseSvgRoot(svg);
  if (!root) {
    return false;
  }
  if (root.querySelector('image, foreignObject') != null) {
    return false;
  }
  if (hasOpaqueBackground(root)) {
    return false;
  }
  const levels = new Set<number>();
  for (const color of collectColors(root)) {
    const level = grayLevel(color);
    if (level === null) {
      return false;
    }
    levels.add(level);
  }
  if (hasDefaultBlackShape(root)) {
    levels.add(0);
  }
  return levels.size <= 1;
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
