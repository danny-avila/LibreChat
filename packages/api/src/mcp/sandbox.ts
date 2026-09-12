import fs from 'fs';
import { logger } from '@librechat/data-schemas';

const MAX_CSP_DOMAINS = 32;
/**
 * Mirrored by `MAX_SANDBOX_CSP_PARAM_LENGTH` in `client/src/utils/mcpApps.ts`: anything longer
 * yields the restrictive default policy, so the host must not authorize a link against a
 * declaration the route dropped.
 */
export const MAX_CSP_PARAM_LENGTH = 4096;
/** Replaced on the way out so the proxy can refuse to build a frame it has no response policy for. */
const CSP_APPLIED_PLACEHOLDER = '/*__CSP_APPLIED__*/';
const CSP_APPLIED_MARKER = 'window.__MCP_SANDBOX_CSP_APPLIED = true;';

/**
 * CSP3 host-source shape: optional http(s)/ws(s) scheme, optional wildcard subdomain prefix,
 * hostname characters, optional port (numeric or `*`), optional path. Rejects CSP keywords, schemes
 * with no host, and injection attempts.
 *
 * Keep in sync with `APP_LINK_HOST_PATTERN` in `client/src/utils/mcpApps.ts`: the host authorizes an
 * `openLink` only for declared sources this filter also emits into the enforced policy, so anything
 * the matcher accepts must be accepted here too.
 */
const SAFE_HOST_RE =
  /^(?:(?:https?|wss?):\/\/)?(?:\*\.)?[a-zA-Z0-9][a-zA-Z0-9\-.]*(?::(?:\d{1,5}|\*))?(?:\/[^\s;,'"?#]*)?$/i;

const FRAME_ANCESTOR_RE = /^https?:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*(?::\d{1,5})?$/;

/** Per-resource egress declared by the app's `_meta.ui.csp`, as it arrives on the sandbox URL. */
export interface SandboxCspDeclaration {
  resourceDomains?: string[];
  connectDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

export interface SandboxResponse {
  headers: Record<string, string | string[]>;
  body: string;
}

const toDomainList = (value?: string[]): string => {
  if (!Array.isArray(value)) {
    return '';
  }
  // Trim before testing and emit the trimmed form: joining the raw entry would put its surrounding
  // whitespace (a newline, for instance) into the header.
  return value
    .map((domain) => (typeof domain === 'string' ? domain.trim() : ''))
    .filter((domain) => domain && SAFE_HOST_RE.test(domain))
    .slice(0, MAX_CSP_DOMAINS)
    .join(' ');
};

const buildCspPolicy = (csp: SandboxCspDeclaration, strictCsp: boolean): string => {
  const resourceDomains = toDomainList(csp.resourceDomains);
  const connectDomains = toDomainList(csp.connectDomains) || "'none'";
  const frameDomains = toDomainList(csp.frameDomains);

  const scriptSrc = strictCsp
    ? "script-src 'unsafe-inline' " + resourceDomains
    : "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: data: " + resourceDomains;

  return [
    "default-src 'none'",
    scriptSrc.trim(),
    ("style-src 'unsafe-inline' " + resourceDomains).trim(),
    'connect-src ' + connectDomains,
    // form-action does not fall back to default-src, so with allow-forms a form could post to
    // any origin; bound it to the declared egress allowlist ('none' when none is declared).
    'form-action ' + connectDomains,
    ('img-src data: blob: ' + resourceDomains).trim(),
    ('media-src ' + (resourceDomains || "'none'")).trim(),
    ('font-src ' + (resourceDomains || "'none'")).trim(),
    // The app document is installed by navigating the inner frame to a blob URL, so blob: is
    // unconditional: the spec's sample emits frame-src 'none' only because it installs the document
    // with document.write into about:blank. frameDomains widens it to declared nested iframes.
    ('frame-src blob: ' + frameDomains).trim(),
    // Workers are created from blob URLs and inherit this policy, which default-src 'none' blocks.
    ('worker-src blob: ' + resourceDomains).trim(),
    "object-src 'none'",
    'base-uri ' + (toDomainList(csp.baseUriDomains) || "'self'"),
  ].join('; ');
};

/** An unparseable, oversized, or repeated `csp` param yields the restrictive default policy. */
const parseCspParam = (raw?: string | string[]): SandboxCspDeclaration => {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_CSP_PARAM_LENGTH) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as SandboxCspDeclaration;
  } catch (error) {
    logger.debug('[serveMCPSandbox] Ignoring unparseable csp parameter', error);
    return {};
  }
};

const sandboxHtmlCache = new Map<string, string>();

const readSandboxHtml = (sandboxPath: string): string => {
  const cached = sandboxHtmlCache.get(sandboxPath);
  if (cached != null) {
    return cached;
  }
  const html = fs.readFileSync(sandboxPath, 'utf8');
  sandboxHtmlCache.set(sandboxPath, html);
  return html;
};

/**
 * The MCP Apps spec requires the Host and Sandbox to have different origins for web hosts. Default
 * to same-origin framing; when a dedicated sandbox origin is deployed, the operator lists the
 * allowed host origin(s) so the host page can frame this sandbox cross-origin.
 */
const buildFrameAncestors = (): string => {
  // Only accept scheme://host[:port] tokens. A raw value is interpolated into the CSP header, so
  // an unvalidated token containing ";" would inject an unrelated directive.
  return (process.env.MCP_SANDBOX_FRAME_ANCESTORS || '')
    .trim()
    .split(/[\s,]+/)
    .filter((token) => FRAME_ANCESTOR_RE.test(token))
    .join(' ');
};

/**
 * Builds the sandbox document and the response headers that carry its per-resource policy. The
 * policy varies per request, so it is delivered as a header rather than baked into the document,
 * and the document is only served with the `__CSP_APPLIED__` marker substituted: the proxy inside
 * refuses to build an app frame without it, so a response that skipped this path cannot run an app.
 */
export function buildSandboxResponse({
  sandboxPath,
  csp,
  strictCsp,
}: {
  sandboxPath: string;
  csp?: string | string[];
  strictCsp?: string | string[];
}): SandboxResponse {
  const ancestors = buildFrameAncestors();
  const headers: Record<string, string | string[]> = {
    'Content-Type': 'text/html; charset=utf-8',
    // Required, not merely hygienic: the per-resource policy below varies per request.
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': ancestors ? 'cross-origin' : 'same-origin',
  };
  if (!ancestors) {
    headers['X-Frame-Options'] = 'SAMEORIGIN';
  }
  const ancestorsPolicy = ancestors
    ? `frame-ancestors 'self' ${ancestors}`
    : "frame-ancestors 'self'";
  // frame-ancestors stays its own policy: CSP3 excludes it from the meta-element path, and
  // multiple policies intersect, so the resource policy cannot loosen it.
  headers['Content-Security-Policy'] = [
    ancestorsPolicy,
    buildCspPolicy(parseCspParam(csp), strictCsp === '1'),
  ];

  return {
    headers,
    body: readSandboxHtml(sandboxPath).replace(CSP_APPLIED_PLACEHOLDER, CSP_APPLIED_MARKER),
  };
}
