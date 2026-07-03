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
 * SVG elements safe to keep for an icon. Drawing, shape, gradient, clip, and
 * filter primitives, plus `use` for self-contained `<defs>` references (common
 * exporter output). The filter set mirrors the client sanitizer's DOMPurify
 * `svgFilters` profile so an icon that previews with effects is stored intact.
 * `script`, `foreignObject`, `style`, `a`, `image`, `animate`, and `set` are
 * intentionally omitted so no active content, embedded HTML, or navigation
 * survives; hrefs are restricted to same-document fragments below.
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
  'use',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'title',
  'desc',
  'filter',
  'feBlend',
  'feColorMatrix',
  'feComponentTransfer',
  'feComposite',
  'feConvolveMatrix',
  'feDiffuseLighting',
  'feDisplacementMap',
  'feDistantLight',
  'feDropShadow',
  'feFlood',
  'feFuncA',
  'feFuncB',
  'feFuncG',
  'feFuncR',
  'feGaussianBlur',
  'feImage',
  'feMerge',
  'feMergeNode',
  'feMorphology',
  'feOffset',
  'fePointLight',
  'feSpecularLighting',
  'feSpotLight',
  'feTile',
  'feTurbulence',
];

/**
 * Presentation and geometry attributes safe to keep. `href`/`xlink:href` are
 * allowed but restricted to same-document fragments (`#id`) by the tag
 * transform below, so local `<use>`/gradient references survive while external
 * references and `javascript:` URLs are stripped; `on*` handlers are never
 * allowed.
 */
const ALLOWED_SVG_ATTRS = [
  'viewBox',
  'xmlns',
  'xmlns:xlink',
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
  'href',
  'xlink:href',
  'filter',
  'filterUnits',
  'primitiveUnits',
  'color-interpolation-filters',
  'in',
  'in2',
  'result',
  'mode',
  'type',
  'values',
  'operator',
  'k1',
  'k2',
  'k3',
  'k4',
  'stdDeviation',
  'dx',
  'dy',
  'flood-color',
  'flood-opacity',
  'lighting-color',
  'surfaceScale',
  'diffuseConstant',
  'specularConstant',
  'specularExponent',
  'azimuth',
  'elevation',
  'pointsAtX',
  'pointsAtY',
  'pointsAtZ',
  'limitingConeAngle',
  'radius',
  'scale',
  'xChannelSelector',
  'yChannelSelector',
  'baseFrequency',
  'numOctaves',
  'seed',
  'stitchTiles',
  'order',
  'kernelMatrix',
  'divisor',
  'bias',
  'targetX',
  'targetY',
  'edgeMode',
  'preserveAlpha',
  'slope',
  'intercept',
  'amplitude',
  'exponent',
  'tableValues',
];

/** Matches every `url(...)` reference in a presentation/style value, capturing
 *  the optional quote and the target so non-fragment references can be rejected. */
const CSS_URL_REFERENCE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;

/** True when a value carries a `url(...)` reference that is not a same-document
 *  fragment, e.g. `url(https://…)`, `url(//…)`, `url(data:…)`, or `url(x.svg#id)`. */
function hasExternalUrlReference(value: string): boolean {
  CSS_URL_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CSS_URL_REFERENCE.exec(value)) !== null) {
    if (!match[2].trim().startsWith('#')) {
      return true;
    }
  }
  return false;
}

/**
 * Drops references that leave the document: any `href`/`xlink:href` that is not a
 * same-document fragment, and any attribute (`filter`, `fill`, `mask`,
 * `clip-path`, `style`, …) carrying a non-fragment `url(...)`. Mirrors the
 * client-side `sanitizeSvg` rule so stored icons cannot pull external resources.
 */
function keepLocalReferences(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  for (const [name, value] of Object.entries(attribs)) {
    if (name === 'href' || name === 'xlink:href') {
      if (!value.trim().startsWith('#')) {
        delete attribs[name];
      }
      continue;
    }
    if (hasExternalUrlReference(value)) {
      delete attribs[name];
    }
  }
  return { tagName, attribs };
}

/**
 * `parser.lowerCaseTags`/`lowerCaseAttributeNames` are disabled so case-
 * sensitive SVG names (`viewBox`, `linearGradient`, `clipPath`, …) survive the
 * round-trip; lowercasing them would break rendering. `allowedSchemes` is empty
 * as a second layer behind the fragment-only href transform: a fragment carries
 * no scheme, so nothing legitimate is affected.
 */
const SVG_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_SVG_TAGS,
  allowedAttributes: { '*': ALLOWED_SVG_ATTRS },
  allowedSchemes: [],
  transformTags: { '*': keepLocalReferences },
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
