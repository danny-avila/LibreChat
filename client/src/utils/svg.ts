import DOMPurify from 'dompurify';

/**
 * Decides whether a custom icon is a monochrome glyph that should be tinted to
 * `currentColor` (so it follows the active theme) or a multi-color logo / raster
 * that must keep its original colors. Instead of parsing SVG source, the icon is
 * drawn to an offscreen canvas and its rendered pixels are sampled, letting the
 * browser resolve fills, strokes, `<use>`, filters, and CSS exactly as it paints.
 */

/** Largest canvas dimension used when sampling; keeps the pixel read cheap while
 *  preserving enough detail to catch a chromatic accent. */
const SAMPLE_SIZE = 64;

/** Per-channel spread (0-255) a pixel may have and still count as grayscale. */
const GRAYSCALE_TOLERANCE = 16;

/** Pixels at or below this alpha paint nothing visible and are skipped. */
const ALPHA_THRESHOLD = 8;

/**
 * True when the icon can be safely tinted to a single theme color. In one pass it
 * requires that every sufficiently opaque pixel is grayscale (its red, green, and
 * blue channels differ by no more than the tolerance) and that at least one pixel
 * is genuinely empty (at or below the paint threshold). A fully transparent image
 * paints no tone, and one whose every pixel is painted, even at partial opacity,
 * has no glyph-shaped hole for a CSS mask to reveal and would flatten to a solid
 * currentColor wash, so neither counts as monochrome.
 */
export function scanMonochrome(data: Uint8ClampedArray): boolean {
  let painted = false;
  let hasEmptyArea = false;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha <= ALPHA_THRESHOLD) {
      hasEmptyArea = true;
      continue;
    }
    painted = true;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (
      Math.abs(r - g) > GRAYSCALE_TOLERANCE ||
      Math.abs(g - b) > GRAYSCALE_TOLERANCE ||
      Math.abs(r - b) > GRAYSCALE_TOLERANCE
    ) {
      return false;
    }
  }
  return painted && hasEmptyArea;
}

/** The dimensions to sample the image at, scaled down to `SAMPLE_SIZE`, or null
 *  when the image reports no intrinsic size. */
function sampleSize(image: HTMLImageElement): { width: number; height: number } | null {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    return null;
  }
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Draws the image to an offscreen canvas and returns its pixel data, or null when
 * the canvas is unavailable or reading it throws because a non-CORS cross-origin
 * image tainted the canvas.
 */
function samplePixels(image: HTMLImageElement): Uint8ClampedArray | null {
  const size = sampleSize(image);
  if (!size || typeof document === 'undefined') {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, size.width, size.height);
  try {
    return context.getImageData(0, 0, size.width, size.height).data;
  } catch {
    return null;
  }
}

/**
 * Loads an icon and resolves whether it is monochrome by sampling its rendered
 * pixels. Any failure (load error, missing canvas support, or a canvas tainted by
 * a non-CORS cross-origin image) resolves to false so the icon renders untinted
 * rather than throwing.
 */
export function detectMonochrome(src: string): Promise<boolean> {
  if (typeof Image === 'undefined') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const data = samplePixels(image);
      resolve(data != null && scanMonochrome(data));
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });
}

/** Matches every `url(...)` reference in a CSS/presentation value, capturing the
 *  optional quote and the target so non-fragment references can be rejected. */
const CSS_URL_REFERENCE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/** True when a value carries a `url(...)` reference that is not a same-document
 *  fragment, e.g. `url(https://…)`, `url(//…)`, `url(data:…)`, or `url(x.svg#id)`. */
export function hasExternalUrlReference(value: string): boolean {
  CSS_URL_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CSS_URL_REFERENCE.exec(value)) !== null) {
    if (!match[2].trim().startsWith('#')) {
      return true;
    }
  }
  return false;
}

let svgPurifier: ReturnType<typeof DOMPurify> | null = null;

/**
 * Dedicated DOMPurify instance for SVG icons, so the local-reference hook never
 * leaks into the app's shared default instance. The hook keeps same-document
 * references (`href="#id"` on `<use>`/gradients and `url(#id)` paint/filter/clip
 * values — common exporter output) while stripping every external, relative, or
 * scheme-carrying `href` or `url(...)` that could smuggle a fetch or navigation.
 */
function getSvgPurifier(): ReturnType<typeof DOMPurify> {
  if (svgPurifier) {
    return svgPurifier;
  }
  svgPurifier = DOMPurify(window);
  svgPurifier.addHook('afterSanitizeAttributes', (node) => {
    for (const attr of ['href', 'xlink:href']) {
      const value = node.getAttribute(attr);
      if (value != null && !value.trim().startsWith('#')) {
        node.removeAttribute(attr);
      }
    }
    for (const attr of Array.from(node.attributes)) {
      if (hasExternalUrlReference(attr.value)) {
        node.removeAttribute(attr.name);
      }
    }
  });
  return svgPurifier;
}

/**
 * Strips active and external-referencing content from user-provided SVG markup,
 * leaving only safe drawing elements. The `svg`/`svgFilters` profiles restrict
 * the tag set and DOMPurify drops every `on*` handler by default; on top of that
 * the forbidden tags remove embedded HTML (`foreignObject`), scripts, stylesheets,
 * links, and animation, while `<use>` is re-allowed with hrefs restricted to
 * same-document fragments by the purifier hook.
 */
export function sanitizeSvg(svg: string): string {
  return getSvgPurifier().sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ['use'],
    FORBID_TAGS: ['script', 'foreignObject', 'style', 'a', 'image', 'animate', 'set'],
  });
}

/**
 * Encodes SVG markup as a base64 `image/svg+xml` data URI. Base64 keeps the
 * payload at a flat ~1.33x of the source, versus the ~1.5x+ of percent-encoding
 * for the angle-bracket-heavy SVG that ships in every server/group listing. The
 * `encodeURIComponent` round-trip converts UTF-8 to a binary string first so
 * `btoa` handles non-ASCII glyphs without throwing.
 */
export function svgToDataUri(svg: string): string {
  const binary = encodeURIComponent(svg).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
