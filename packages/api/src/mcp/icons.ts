import sanitizeHtml from 'sanitize-html';

/**
 * Server-side sanitization for user-provided MCP server icons. The client
 * sanitizes uploaded SVGs before inlining them, but that runs in the browser
 * and is trivially bypassed by posting an `iconPath` straight to the API, so
 * every stored icon is re-sanitized here at the trust boundary before it is
 * persisted and served back to other users.
 *
 * Only `data:image/svg+xml` values carry active content worth stripping; raster
 * data URIs, `http(s)` URLs, and relative paths render inertly through `<img>`
 * / CSS masks and pass through untouched.
 */

/** Matches an `image/svg+xml` data URI regardless of the encoding suffix. */
const SVG_DATA_URI = /^data:image\/svg\+xml/i;

/**
 * SVG elements safe to keep for an icon. Drawing, shape, gradient, and clip
 * primitives only. `script`, `foreignObject`, `style`, `a`, `use`, `image`,
 * `animate`, and `set` are intentionally omitted so no active content, embedded
 * HTML, external references, or href smuggling survives.
 */
const ALLOWED_SVG_TAGS = [
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'title',
  'desc',
];

/**
 * Presentation and geometry attributes safe to keep. Deliberately excludes
 * `href`/`xlink:href` and any `on*` handler so external references and event
 * handlers cannot survive on the allowed elements.
 */
const ALLOWED_SVG_ATTRS = [
  'viewBox',
  'xmlns',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'gradientTransform',
  'gradientUnits',
  'offset',
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-opacity',
  'opacity',
  'stop-color',
  'stop-opacity',
  'clip-path',
  'clip-rule',
  'mask',
  'preserveAspectRatio',
  'id',
  'class',
  'style',
];

/**
 * `parser.lowerCaseTags`/`lowerCaseAttributeNames` are disabled so case-
 * sensitive SVG names (`viewBox`, `linearGradient`, `clipPath`, …) survive the
 * round-trip; lowercasing them would break rendering.
 */
const SVG_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_SVG_TAGS,
  allowedAttributes: { '*': ALLOWED_SVG_ATTRS },
  allowedSchemes: ['http', 'https'],
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
};

/** Decode an `image/svg+xml` data URI body to its raw markup, or null when it
 *  is malformed. Handles both base64 and percent-encoded payloads. */
function decodeSvgDataUri(iconPath: string): string | null {
  const comma = iconPath.indexOf(',');
  if (comma === -1) {
    return null;
  }
  const meta = iconPath.slice(0, comma);
  const body = iconPath.slice(comma + 1);
  try {
    if (/;base64/i.test(meta)) {
      return Buffer.from(body, 'base64').toString('utf-8');
    }
    return decodeURIComponent(body);
  } catch {
    return null;
  }
}

/**
 * Sanitize a user-provided MCP `iconPath`. SVG data URIs are decoded, stripped
 * of active content via an allowlist, and re-encoded; a malformed SVG data URI
 * resolves to an empty string so a broken icon is stored rather than raw markup.
 * All other values (raster data URIs, URLs, relative paths) are returned
 * unchanged.
 */
export function sanitizeMcpIconPath(iconPath: string): string {
  if (!SVG_DATA_URI.test(iconPath)) {
    return iconPath;
  }
  const svg = decodeSvgDataUri(iconPath);
  if (svg == null) {
    return '';
  }
  const clean = sanitizeHtml(svg, SVG_SANITIZE_OPTIONS);
  return `data:image/svg+xml,${encodeURIComponent(clean)}`;
}
