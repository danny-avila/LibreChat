import DOMPurify from 'dompurify';

/**
 * Heuristics for deciding whether a custom SVG icon is a monochrome glyph that
 * should be tinted to `currentColor` (so it follows the active theme) or a
 * multi-color logo / embedded raster that must keep its original colors. The SVG
 * is parsed with `DOMParser` and its elements are inspected, rather than scraped
 * with regexes.
 */

/** Color keywords that paint nothing (or defer) and so contribute no tone. */
const IGNORABLE_COLORS = new Set(['none', 'transparent', 'inherit']);

/** `currentColor` is a visible paint that follows the theme; it has no fixed level. */
const CURRENT_COLOR = 'currentcolor';
const CURRENT_COLOR_TONE = -1;

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

/**
 * Shapes that render with SVG's default black fill when none is supplied. Includes
 * `polyline` (SVG closes it for fill painting) but not `line`, which has no area.
 */
const FILLABLE_SHAPES = 'path, rect, circle, ellipse, polygon, polyline, text';

/**
 * Containers whose descendants supply functional paint (clipping, masking,
 * markers, tiles) that never appears as a visible tone. Their colors are ignored.
 * `defs`/`symbol` are intentionally excluded: their content renders as-is when
 * pulled in via `<use>`, so those colors must still be scanned.
 */
const FUNCTIONAL_CONTAINERS = new Set(['clippath', 'mask', 'marker', 'pattern']);

/**
 * Containers whose descendants do not paint where they are declared. Default-black
 * detection skips these: functional templates never render a plain fill, and
 * `defs`/`symbol` shapes inherit the fill of the `<use>` that instantiates them.
 */
const DEFERRED_CONTAINERS = new Set(['clippath', 'mask', 'marker', 'pattern', 'defs', 'symbol']);

/** Paint properties whose corresponding opacity makes them invisible at zero. */
const PAINT_OPACITY = new Map([
  ['fill', 'fill-opacity'],
  ['stroke', 'stroke-opacity'],
  ['stop-color', 'stop-opacity'],
]);

/** Declarations resolved from `<style>` rules for tint detection. */
const RESOLVED_DECLS = new Set([
  'fill',
  'color',
  'display',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stop-opacity',
]);

/** A `<style>` rule reduced to the paint/opacity declarations we resolve. */
type StyleRule = { selector: string; declarations: Map<string, string> };

/** Matches paint declarations inside a `<style>` block (not `color`, which only
 * resolves `currentColor` rather than painting on its own). */
const CSS_COLOR_REGEX = /(?:fill|stroke|stop-color)\s*:\s*([^;}]+)/gi;

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

/** Returns a color's alpha (0-1), defaulting to 1 when none is encoded or parseable. */
function paintAlpha(color: string): number {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 4) {
      const a = parseInt(hex[3] + hex[3], 16);
      return Number.isNaN(a) ? 1 : a / 255;
    }
    if (hex.length === 8) {
      const a = parseInt(hex.slice(6, 8), 16);
      return Number.isNaN(a) ? 1 : a / 255;
    }
    return 1;
  }
  if (color.startsWith('rgb') || color.startsWith('hsl')) {
    const open = color.indexOf('(');
    const close = color.indexOf(')');
    if (open === -1 || close === -1) {
      return 1;
    }
    const parts = color
      .slice(open + 1, close)
      .split(/[,/\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 4) {
      return 1;
    }
    const alpha = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return Number.isNaN(alpha) ? 1 : alpha;
  }
  return 1;
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

function isOpaqueRect(rect: Element, root: Element, rules: StyleRule[]): boolean {
  if (isHidden(rect, root, rules)) {
    return false;
  }
  const fill = resolveFill(rect, root, rules) ?? '';
  if (fill === 'none' || fill === 'transparent' || paintAlpha(fill) === 0) {
    return false;
  }
  return !paintInvisible(rect, root, rules, 'fill');
}

/**
 * A full-canvas opaque `<rect>` at the origin cannot be tinted via a CSS mask:
 * the mask uses alpha, so an opaque background fills the whole area with the
 * tint color instead of the glyph.
 */
function hasOpaqueBackground(root: Element, rules: StyleRule[]): boolean {
  const { width, height } = canvasSize(root);
  for (const rect of Array.from(root.querySelectorAll('rect'))) {
    if (!isOpaqueRect(rect, root, rules) || isInside(rect, root, FUNCTIONAL_CONTAINERS)) {
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

/**
 * The tones a CSS `currentColor` paint contributes: it is resolved per element
 * the rule matches (against an inherited fixed `color`), so a fixed color is
 * preserved rather than recorded as the theme-following sentinel.
 */
function resolveCssCurrentColor(root: Element, selector: string, rules: StyleRule[]): string[] {
  if (selector === '') {
    return [];
  }
  let matched: Element[];
  try {
    matched = Array.from(root.querySelectorAll(selector));
  } catch {
    return [CURRENT_COLOR];
  }
  return matched.map((el) => resolveCurrentColor(el, root, rules));
}

function colorsFromStyleBlocks(root: Element, rules: StyleRule[]): string[] {
  const colors: string[] = [];
  for (const style of Array.from(root.querySelectorAll('style'))) {
    for (const rule of (style.textContent ?? '').split('}')) {
      const brace = rule.indexOf('{');
      if (brace === -1) {
        continue;
      }
      const selector = rule.slice(0, brace).trim();
      for (const match of rule.slice(brace + 1).matchAll(CSS_COLOR_REGEX)) {
        const value = match[1].trim();
        if (value.toLowerCase() === CURRENT_COLOR) {
          colors.push(...resolveCssCurrentColor(root, selector, rules));
        } else {
          colors.push(value);
        }
      }
    }
  }
  return colors;
}

/**
 * Resolves a `currentColor` paint to the fixed `color` set on the element or an
 * ancestor (inline style, attribute, or CSS), since that is what the icon actually
 * renders. Returns `currentColor` unchanged when no fixed color is in scope,
 * meaning the paint follows the theme.
 */
function resolveCurrentColor(el: Element, root: Element, rules: StyleRule[]): string {
  let current: Element | null = el;
  while (current != null) {
    const color = styleValue(current, rules, 'color');
    if (color != null && color !== '' && color !== 'inherit' && color !== CURRENT_COLOR) {
      return color;
    }
    if (current === root) {
      break;
    }
    current = current.parentElement;
  }
  return CURRENT_COLOR;
}

function collectColors(root: Element, rules: StyleRule[]): string[] {
  const colors: string[] = [];
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (
      el.nodeName.toLowerCase() === 'style' ||
      isInside(el, root, FUNCTIONAL_CONTAINERS) ||
      isHidden(el, root, rules)
    ) {
      continue;
    }
    for (const prop of PAINT_PROPS) {
      const value = readPaint(el, prop);
      if (!value || paintInvisible(el, root, rules, prop)) {
        continue;
      }
      colors.push(
        value.trim().toLowerCase() === CURRENT_COLOR ? resolveCurrentColor(el, root, rules) : value,
      );
    }
  }
  colors.push(...colorsFromStyleBlocks(root, rules));
  return colors
    .map((color) => color.trim().toLowerCase())
    .filter((color) => color.length > 0 && !IGNORABLE_COLORS.has(color) && paintAlpha(color) !== 0);
}

/** Paint/opacity rules parsed from `<style>` blocks, in source order. */
function parseStyleRules(root: Element): StyleRule[] {
  const rules: StyleRule[] = [];
  for (const style of Array.from(root.querySelectorAll('style'))) {
    for (const rule of (style.textContent ?? '').split('}')) {
      const brace = rule.indexOf('{');
      if (brace === -1) {
        continue;
      }
      const selector = rule.slice(0, brace).trim();
      if (selector === '') {
        continue;
      }
      const declarations = new Map<string, string>();
      for (const declaration of rule.slice(brace + 1).split(';')) {
        const colon = declaration.indexOf(':');
        if (colon === -1) {
          continue;
        }
        const property = declaration.slice(0, colon).trim().toLowerCase();
        if (RESOLVED_DECLS.has(property)) {
          declarations.set(
            property,
            declaration
              .slice(colon + 1)
              .trim()
              .toLowerCase(),
          );
        }
      }
      if (declarations.size > 0) {
        rules.push({ selector, declarations });
      }
    }
  }
  return rules;
}

/** The value matching CSS rules assign to a property (last match wins), or null. */
function cssDecl(el: Element, rules: StyleRule[], property: string): string | null {
  let value: string | null = null;
  for (const rule of rules) {
    try {
      if (el.matches(rule.selector)) {
        const declared = rule.declarations.get(property);
        if (declared !== undefined) {
          value = declared;
        }
      }
    } catch {
      continue;
    }
  }
  return value;
}

/** An element's own value for a property from inline style, attribute, or CSS. */
function styleValue(el: Element, rules: StyleRule[], property: string): string | null {
  const own = readPaint(el, property);
  if (own != null && own.trim() !== '') {
    return own.trim().toLowerCase();
  }
  return cssDecl(el, rules, property);
}

/** Parses a property to a number, or null when absent/unparseable. */
function styleNumber(el: Element, rules: StyleRule[], property: string): number | null {
  const value = styleValue(el, rules, property);
  if (value == null) {
    return null;
  }
  const number = parseFloat(value);
  return Number.isNaN(number) ? null : number;
}

/** True when the element or an ancestor is removed from rendering via `display:none`. */
function isHidden(el: Element, root: Element, rules: StyleRule[]): boolean {
  let current: Element | null = el;
  while (current != null) {
    if (styleValue(current, rules, 'display') === 'none') {
      return true;
    }
    if (current === root) {
      break;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * True when a paint is fully transparent through opacity: the element (or an
 * ancestor group) has `opacity:0`, or the inherited paint-specific opacity (e.g.
 * `fill-opacity`) resolves to zero.
 */
function paintInvisible(
  el: Element,
  root: Element,
  rules: StyleRule[],
  paintProp: string,
): boolean {
  const opacityProp = PAINT_OPACITY.get(paintProp);
  let current: Element | null = el;
  while (current != null) {
    if (styleNumber(current, rules, 'opacity') === 0) {
      return true;
    }
    if (opacityProp != null) {
      const value = styleNumber(current, rules, opacityProp);
      if (value != null) {
        return value === 0;
      }
    }
    if (current === root) {
      break;
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Resolves the fill an element renders with, following inheritance: its own
 * explicit fill, then a matching CSS rule, then the same up its ancestors until
 * `boundary` (inclusive). `inherit` defers to the next ancestor. Returns null when
 * nothing sets a fill, meaning the element falls back to default black. For content
 * rendered through `<use>`, `boundary` is the referenced root (the instance
 * re-parents there).
 */
function resolveFill(el: Element, boundary: Element, rules: StyleRule[]): string | null {
  let current: Element | null = el;
  while (current != null) {
    const value = styleValue(current, rules, 'fill');
    if (value != null && value !== 'inherit') {
      return value;
    }
    if (current === boundary) {
      break;
    }
    current = current.parentElement;
  }
  return null;
}

function fillIsResolved(el: Element, root: Element, rules: StyleRule[]): boolean {
  return resolveFill(el, root, rules) != null;
}

function isInside(el: Element, root: Element, containers: Set<string>): boolean {
  let current = el.parentElement;
  while (current != null && current !== root) {
    if (containers.has(current.nodeName.toLowerCase())) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

/** Path commands beyond a lone move, i.e. the path actually draws a segment. */
const PATH_DRAW_COMMAND = /[lhvcsqtaz]/i;

/**
 * True when a shape can render a fillable area, so its default fill is painted.
 * SVG closes open subpaths when filling, so any path that draws a segment is
 * counted (conservatively, since computing exact area is unreliable); a path with
 * no `d` or only a move command, by contrast, paints nothing.
 */
function rendersFillArea(el: Element): boolean {
  const tag = el.nodeName.toLowerCase();
  if (tag === 'path') {
    const d = el.getAttribute('d');
    return d != null && PATH_DRAW_COMMAND.test(d);
  }
  if (tag === 'text') {
    return (el.textContent ?? '').trim().length > 0;
  }
  return true;
}

/**
 * True when a rendered shape paints with SVG's default black fill: no explicit or
 * CSS fill resolves for it (or an ancestor), it is not a non-rendering template,
 * and it encloses a fillable area. A stroke does not suppress the default fill, so
 * a closed stroked shape still renders black. Such a shape contributes a black
 * tone that explicit paint values alone do not capture.
 */
function hasDefaultBlackShape(root: Element, rules: StyleRule[]): boolean {
  for (const el of Array.from(root.querySelectorAll(FILLABLE_SHAPES))) {
    if (
      fillIsResolved(el, root, rules) ||
      isInside(el, root, DEFERRED_CONTAINERS) ||
      isHidden(el, root, rules)
    ) {
      continue;
    }
    if (rendersFillArea(el)) {
      return true;
    }
  }
  return false;
}

/** The element a `<use>` references by local id (`href`/`xlink:href`), or null. */
function referencedTarget(use: Element, root: Element): Element | null {
  const ref = use.getAttribute('href') ?? use.getAttribute('xlink:href');
  if (ref == null || !ref.startsWith('#')) {
    return null;
  }
  const id = ref.slice(1);
  if (id === '') {
    return null;
  }
  for (const el of Array.from(root.querySelectorAll('[id]'))) {
    if (el.getAttribute('id') === id) {
      return el;
    }
  }
  return null;
}

/** True when a referenced template has a fillable shape with no fill of its own. */
function targetHasDefaultBlackShape(target: Element, rules: StyleRule[]): boolean {
  const shapes = Array.from(target.querySelectorAll(FILLABLE_SHAPES));
  if (target.matches(FILLABLE_SHAPES)) {
    shapes.unshift(target);
  }
  for (const el of shapes) {
    if (
      resolveFill(el, target, rules) != null ||
      isInside(el, target, FUNCTIONAL_CONTAINERS) ||
      isHidden(el, target, rules)
    ) {
      continue;
    }
    if (rendersFillArea(el)) {
      return true;
    }
  }
  return false;
}

/**
 * True when a visible `<use>` renders a template's default black fill: the use
 * supplies no fill of its own, so an unpainted shape in the referenced content
 * paints black at the instance.
 */
function hasDefaultBlackUse(root: Element, rules: StyleRule[]): boolean {
  for (const use of Array.from(root.querySelectorAll('use'))) {
    if (isInside(use, root, DEFERRED_CONTAINERS) || fillIsResolved(use, root, rules)) {
      continue;
    }
    const target = referencedTarget(use, root);
    if (target != null && targetHasDefaultBlackShape(target, rules)) {
      return true;
    }
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
  const rules = parseStyleRules(root);
  if (hasOpaqueBackground(root, rules)) {
    return false;
  }
  const levels = new Set<number>();
  for (const color of collectColors(root, rules)) {
    if (color === CURRENT_COLOR) {
      levels.add(CURRENT_COLOR_TONE);
      continue;
    }
    const level = grayLevel(color);
    if (level === null) {
      return false;
    }
    levels.add(level);
  }
  if (hasDefaultBlackShape(root, rules) || hasDefaultBlackUse(root, rules)) {
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
