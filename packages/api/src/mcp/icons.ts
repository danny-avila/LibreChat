import sanitizeHtml from 'sanitize-html';
import { MAX_MCP_ICON_PATH_LENGTH } from 'librechat-data-provider';

/**
 * Server-side sanitization for user-provided MCP server icons. The client
 * sanitizes uploaded SVGs before encoding them as data URIs, but that runs in the browser
 * and is trivially bypassed by posting an `iconPath` straight to the API, so
 * every stored icon is re-sanitized here at the trust boundary before it is
 * persisted and returned to other users in MCP configuration responses.
 *
 * Only `data:image/svg+xml` values carry active content worth stripping; raster
 * data URIs, `http(s)` URLs, and relative paths render inertly through `<img>`
 * / CSS masks and pass through untouched.
 */

/** Matches an `image/svg+xml` data URI regardless of the encoding suffix. */
const SVG_DATA_URI = /^data:image\/svg\+xml/i;

/**
 * SVG elements safe to keep for an icon. Drawing, shape, gradient, clip, marker,
 * and filter primitives, plus `use` for self-contained `<defs>` references
 * (common exporter output). The filter set mirrors the client sanitizer's
 * DOMPurify `svgFilters` profile so an icon that previews with effects is stored
 * intact. `script`, `foreignObject`, `style`, `a`, `image`, `animate`, and `set`
 * are intentionally omitted so no active content, embedded HTML, or navigation
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
  'textPath',
  'defs',
  'use',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'marker',
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
  'startOffset',
  'color',
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
  'marker-start',
  'marker-mid',
  'marker-end',
  'markerWidth',
  'markerHeight',
  'markerUnits',
  'refX',
  'refY',
  'orient',
  'preserveAspectRatio',
  'id',
  'class',
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

/** Matches a same-document `url(#id)` reference (optionally quoted) or `none`. */
const LOCAL_URL_REFERENCE = /^(?:none|url\(\s*(['"]?)#[^'")]*\1\s*\))$/;

/**
 * Drops `href`/`xlink:href` references that leave the document while preserving
 * same-document fragments used by `<use>` and gradients, and restricts
 * `marker-start`/`marker-mid`/`marker-end` to fragment-only `url(#id)` values.
 */
function keepLocalReferences(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  for (const [name, value] of Object.entries(attribs)) {
    if (name === 'href' || name === 'xlink:href') {
      if (!value.trim().startsWith('#')) {
        delete attribs[name];
      }
    } else if (name === 'marker-start' || name === 'marker-mid' || name === 'marker-end') {
      if (!LOCAL_URL_REFERENCE.test(value.trim())) {
        delete attribs[name];
      }
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
 * Normalizes a value the way a browser does before it resolves an `<img src>` or
 * CSS `url()`: strips leading and trailing C0 controls and spaces, then removes
 * any ASCII tab/newline anywhere. Without this, a prefix like `\n data:…` (or an
 * embedded newline in the media type) slips past the anchored data-URI check yet
 * still renders once the browser trims it, leaving the SVG unsanitized.
 */
function normalizeIconValue(value: string): string {
  const isTabOrNewline = (code: number) => code === 0x09 || code === 0x0a || code === 0x0d;
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) {
    start += 1;
  }
  while (end > start && value.charCodeAt(end - 1) <= 0x20) {
    end -= 1;
  }
  const chars: string[] = [];
  for (let i = start; i < end; i += 1) {
    if (!isTabOrNewline(value.charCodeAt(i))) {
      chars.push(value[i]);
    }
  }
  return chars.join('');
}

/**
 * Sanitize a user-provided MCP `iconPath`. SVG data URIs are decoded, stripped
 * of active content via an allowlist, and re-encoded as base64; a malformed SVG
 * data URI resolves to an empty string so a broken icon is stored rather than
 * raw markup. Other values (raster data URIs, URLs, relative paths) pass through
 * unchanged unless they exceed the length cap.
 *
 * This is the single enforcement point for `MAX_MCP_ICON_PATH_LENGTH`: any value
 * still over the cap after sanitizing is dropped to an empty string. Enforcing it
 * here rather than as a schema `.max()` means editing a server whose stored icon
 * predates the cap succeeds (the oversized icon is cleared) instead of failing
 * validation and locking the user out of the whole update. Base64 also keeps SVG
 * output compact so a legitimate icon is rarely dropped.
 */
export function sanitizeMcpIconPath(iconPath: string): string {
  const normalized = normalizeIconValue(iconPath);
  if (!SVG_DATA_URI.test(normalized)) {
    return iconPath.length > MAX_MCP_ICON_PATH_LENGTH ? '' : iconPath;
  }
  const svg = decodeSvgDataUri(normalized);
  if (svg == null) {
    return '';
  }
  const clean = sanitizeHtml(svg, SVG_SANITIZE_OPTIONS);
  const encoded = `data:image/svg+xml;base64,${Buffer.from(clean, 'utf-8').toString('base64')}`;
  return encoded.length > MAX_MCP_ICON_PATH_LENGTH ? '' : encoded;
}
