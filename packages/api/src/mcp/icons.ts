import type createDOMPurify from 'dompurify';
import {
  MAX_MCP_ICON_PATH_LENGTH,
  SVG_SANITIZE_CONFIG,
  restrictSvgReferences,
  restoreSvgTagCase,
} from 'librechat-data-provider';

/**
 * Server-side sanitization for user-provided MCP server icons. The client
 * sanitizes uploaded SVGs before encoding them as data URIs, but that runs in the
 * browser and is trivially bypassed by posting an `iconPath` straight to the API,
 * so every stored icon is re-sanitized here at the trust boundary before it is
 * persisted and returned to other users in MCP configuration responses.
 *
 * Both sides run DOMPurify with the shared `SVG_SANITIZE_CONFIG`, so an icon that
 * previews correctly is stored intact and neither side can drift into stripping
 * what the other keeps.
 *
 * Only `data:image/svg+xml` values carry active content worth stripping; raster
 * data URIs, `http(s)` URLs, and relative paths render inertly through `<img>`
 * / CSS masks and pass through untouched.
 */

/** Matches an `image/svg+xml` data URI regardless of the encoding suffix. */
const SVG_DATA_URI = /^data:image\/svg\+xml/i;

type SvgPurifier = ReturnType<typeof createDOMPurify>;

let purifier: SvgPurifier | null = null;

/**
 * DOMPurify bound to a jsdom window. jsdom and dompurify are required here, not
 * at module load, so `require('@librechat/api')` does not pull their graphs into
 * workers and tests that never sanitize an icon. The instance is reused because
 * the reference hook only needs to be registered once.
 */
function getSvgPurifier(): SvgPurifier {
  if (purifier) {
    return purifier;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- deferred off the api barrel
  const { JSDOM } = require('jsdom') as typeof import('jsdom');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- same as jsdom
  const loaded = require('dompurify') as
    | typeof createDOMPurify
    | { default: typeof createDOMPurify };
  const create = typeof loaded === 'function' ? loaded : loaded.default;
  purifier = create(new JSDOM('').window);
  purifier.addHook('afterSanitizeAttributes', restrictSvgReferences);
  return purifier;
}

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
 * of active content, and re-encoded as base64; a malformed SVG data URI resolves
 * to an empty string so a broken icon is stored rather than raw markup. Other
 * values (raster data URIs, URLs, relative paths) pass through unchanged unless
 * they exceed the length cap.
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
  const clean = restoreSvgTagCase(getSvgPurifier().sanitize(svg, SVG_SANITIZE_CONFIG));
  const encoded = `data:image/svg+xml;base64,${Buffer.from(clean, 'utf-8').toString('base64')}`;
  return encoded.length > MAX_MCP_ICON_PATH_LENGTH ? '' : encoded;
}
