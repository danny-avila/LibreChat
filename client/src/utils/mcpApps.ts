import { Tools, request, apiBaseUrl, isMcpAppMimeType } from 'librechat-data-provider';
import type { TAttachment, UIResource } from 'librechat-data-provider';

export type AppToolResult = {
  content: unknown[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

/**
 * An MCP App resource is server-bound and declares the MCP Apps HTML profile
 * (`text/html;profile=mcp-app`). Only these run the App Bridge handshake; plain `text/html`
 * resources are static and must render through a srcDoc iframe instead.
 */
export function isMcpAppResource(resource: UIResource): boolean {
  // Shared with the server's app-backed classification so the two sides cannot drift: a substring
  // test here accepted mime types the parser refuses to attach bridge fields to.
  return !!resource.toolName && !!resource.serverName && isMcpAppMimeType(resource.mimeType);
}

/**
 * Builds the App Bridge tool result from a UI resource. App-backed resources (toolName +
 * serverName) always produce a result so the app's ontoolresult fires even for empty output,
 * and the tool result's _meta is forwarded for apps that hydrate from it.
 */
export function buildAppToolResult(resource: UIResource): AppToolResult | undefined {
  const sc = resource.structuredContent as Record<string, unknown> | undefined | null;
  const content = (resource.content as unknown[] | undefined) ?? [];
  const meta = resource.resultMeta as Record<string, unknown> | undefined;
  const hasStructured = !!sc && typeof sc === 'object' && !Array.isArray(sc);
  const isAppBacked = !!(resource.toolName && resource.serverName);
  if (
    !hasStructured &&
    content.length === 0 &&
    meta == null &&
    resource.isError !== true &&
    !isAppBacked
  ) {
    return undefined;
  }
  return {
    content,
    ...(hasStructured ? { structuredContent: sc } : {}),
    ...(resource.isError === true ? { isError: true } : {}),
    ...(meta != null ? { _meta: meta } : {}),
  };
}

export function getMCPSandboxUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const base = env.VITE_MCP_SANDBOX_URL ?? `${apiBaseUrl()}/api/mcp/sandbox`;
  const strictCsp =
    env.VITE_MCP_SANDBOX_STRICT_CSP === 'true' || env.VITE_MCP_SANDBOX_STRICT_CSP === '1';
  try {
    const url = new URL(base, window.location.origin);
    url.searchParams.set('parentOrigin', window.location.origin);
    if (strictCsp) {
      url.searchParams.set('strictCsp', '1');
    }
    return url.toString();
  } catch {
    return base;
  }
}

/**
 * Must match `MAX_CSP_PARAM_LENGTH` in `serveMCPSandbox` (`api/server/controllers/mcpApps.js`), which
 * falls back to the restrictive default policy for anything longer.
 */
export const MAX_SANDBOX_CSP_PARAM_LENGTH = 4096;

/**
 * The sandbox document's per-resource CSP is delivered as a response header on the sandbox URL, so
 * the declared domains have to be on the URL before the document loads; the blob app document
 * inherits that policy. Returns the csp that actually reached the response boundary, which is what
 * bounds the app: a declaration the route would reject is dropped here too, so the host cannot
 * authorize a link against domains the enforced policy never received.
 */
export function withSandboxCsp(
  sandboxUrl: string,
  csp: UIResource['csp'],
): { url: string; applied: UIResource['csp'] } {
  if (!csp) {
    return { url: sandboxUrl, applied: undefined };
  }
  try {
    const serialized = JSON.stringify(csp);
    if (serialized.length > MAX_SANDBOX_CSP_PARAM_LENGTH) {
      return { url: sandboxUrl, applied: undefined };
    }
    const url = new URL(sandboxUrl, window.location.origin);
    url.searchParams.set('csp', serialized);
    return { url: url.toString(), applied: csp };
  } catch {
    return { url: sandboxUrl, applied: undefined };
  }
}

/**
 * Stable identity for a UI resource across re-renders. Keying render state by array index lets a
 * removed resource hand its loaded/torn-down state and measured height to whichever resource
 * reconciles onto its index.
 */
export function getResourceKey(resource: UIResource): string {
  return resource.resourceId || resource.uri;
}

/** UI resources on a tool call that this host can render: app-backed views, plus inert static HTML. */
export function selectToolCallUIResources(attachments?: TAttachment[]): UIResource[] {
  const uiResources: UIResource[] =
    attachments
      ?.filter((attachment) => attachment.type === Tools.ui_resources)
      .flatMap((attachment) => (attachment[Tools.ui_resources] ?? []) as UIResource[]) ?? [];
  return uiResources.filter(
    (resource) =>
      isMcpAppResource(resource) ||
      (getInlineResourceHtml(resource) != null &&
        (resource.mimeType ?? 'text/html').includes('html')),
  );
}

export async function callMCPAppTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
) {
  return request.post(`${apiBaseUrl()}/api/mcp/app-tool-call`, {
    serverName,
    toolName,
    arguments: args,
  });
}

export async function readMCPResource(serverName: string, uri: string) {
  return request.post(`${apiBaseUrl()}/api/mcp/resources/read`, { serverName, uri });
}

export async function listMCPResources(serverName: string, cursor?: string) {
  return request.post(`${apiBaseUrl()}/api/mcp/resources/list`, { serverName, cursor });
}

export async function listMCPResourceTemplates(serverName: string, cursor?: string) {
  return request.post(`${apiBaseUrl()}/api/mcp/resources/templates/list`, { serverName, cursor });
}

type ResourceUiMeta = {
  csp?: {
    connectDomains?: string[];
    resourceDomains?: string[];
    frameDomains?: string[];
    baseUriDomains?: string[];
  };
  permissions?: {
    camera?: Record<string, never>;
    microphone?: Record<string, never>;
    geolocation?: Record<string, never>;
    clipboardWrite?: Record<string, never>;
  };
};

/** Decode a base64 resource blob as UTF-8 so non-ASCII HTML is not mojibake (atob yields Latin-1). */
export function decodeBase64Utf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Upper bound for an app-requested iframe height. The size comes from the sandboxed app, so an
 * unclamped value would let it impose multi-million-pixel layout on the host conversation.
 */
export const MAX_APP_VIEW_HEIGHT = 4000;

/**
 * Lower bound for an app-requested iframe height. A few-pixel height hides the app behind its own
 * chrome with no way for the user to recover it.
 */
export const MIN_APP_VIEW_HEIGHT = 80;

/** Upper bound for a carousel slide, which scrolls horizontally in a fixed-height row. */
export const MAX_CAROUSEL_VIEW_HEIGHT = 720;

/** Clamps an app-reported height, returning undefined when it is not a usable positive number. */
export function clampAppViewHeight(
  height?: number,
  bounds?: { min?: number; max?: number },
): number | undefined {
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) {
    return undefined;
  }
  const min = bounds?.min ?? MIN_APP_VIEW_HEIGHT;
  const max = bounds?.max ?? MAX_APP_VIEW_HEIGHT;
  return Math.min(Math.max(Math.round(height), min), max);
}

/**
 * CSP3 §6.6.2.2 host-source grammar, minus the scheme-less form. `scheme-part` is required because
 * the app document has an opaque origin, so §6.7.2.8's "same scheme as the protected resource" rule
 * has no stable answer; `path-part` is rejected because the sandbox filter drops path-bearing
 * entries, so accepting one here would authorize a link the sandbox policy never granted.
 *
 * Keep in sync with `SAFE_HOST_RE` in `serveMCPSandbox` (`api/server/controllers/mcpApps.js`):
 * `isAllowedAppLink` must authorize a strict subset of what the browser grants the same declared
 * source list inside the sandbox, and every deviation from CSP3 here narrows.
 */
const APP_LINK_HOST_PATTERN =
  /^(https?|wss?):\/\/(\*\.)?([a-zA-Z0-9](?:[a-zA-Z0-9\-.]*[a-zA-Z0-9])?)(?::(\d{1,5}|\*))?$/i;

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

function effectivePort(url: URL): string {
  return url.port || DEFAULT_PORTS[url.protocol] || '';
}

/** IPv6 hosts arrive bracketed from `URL`; IPv4 is four decimal labels. CSP3 §6.7.2.10 step 1
 * compares host-parts label by label, so an address literal can never match a wildcard and only
 * ever matches itself: refuse both rather than reason about `0x7f.1` style spellings. */
function isAddressLiteral(hostname: string): boolean {
  return hostname.startsWith('[') || /^\d+(?:\.\d+)*$/.test(hostname);
}

/**
 * Matches a URL against one declared CSP source, following CSP3 §6.7.2.8-11: the scheme must match
 * exactly (no `http`→`https` widening in either direction), an absent `port-part` matches only the
 * scheme's default port, `port-part = '*'` matches any port, and `*.example.com` requires at least
 * one subdomain label so it never covers the apex.
 */
function urlMatchesDeclaredSource(url: URL, entry: string): boolean {
  const match = APP_LINK_HOST_PATTERN.exec(entry.trim());
  if (!match) {
    return false;
  }
  const [, declaredScheme, wildcard, declaredHost, declaredPort] = match;

  // ws(s) declarations are for sockets, not navigable links.
  const scheme = declaredScheme.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return false;
  }
  if (url.protocol !== `${scheme}:`) {
    return false;
  }

  if (
    declaredPort !== '*' &&
    effectivePort(url) !== (declaredPort || DEFAULT_PORTS[`${scheme}:`])
  ) {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const target = declaredHost.toLowerCase();
  // CSP3 compares host-parts label by label, so a trailing dot yields an empty final label that
  // matches nothing; refuse it rather than normalize it into the apex.
  if (!host || host.endsWith('.') || isAddressLiteral(host)) {
    return false;
  }
  if (!wildcard) {
    return host === target;
  }
  return host.length > target.length + 1 && host.endsWith(`.${target}`);
}

/**
 * A host-opened link is not bound by the sandbox CSP, so an app holding proxied MCP data could
 * encode it into a URL and exfiltrate it through the host page. Only hosts the resource declared
 * for egress are opened; a resource declaring none gets no host-opened links, matching the
 * `connect-src 'none'` default applied inside the sandbox.
 */
export function isAllowedAppLink(url: string, csp: UIResource['csp']): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  const declared = [
    ...(csp?.connectDomains ?? []),
    ...(csp?.resourceDomains ?? []),
    ...(csp?.frameDomains ?? []),
  ];
  return declared.some(
    (entry) => typeof entry === 'string' && urlMatchesDeclaredSource(parsed, entry),
  );
}

/**
 * Inline HTML persisted on a UI resource, carried either as `text` or as a base64 `blob`. Read-only
 * views render only inline HTML, so both encodings must count as persisted or blob-embedded apps
 * would be dropped from shared transcripts.
 */
export function getInlineResourceHtml(resource: UIResource): string | undefined {
  if (typeof resource.text === 'string' && resource.text) {
    return resource.text;
  }
  if (typeof resource.blob === 'string' && resource.blob) {
    try {
      return decodeBase64Utf8(resource.blob);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function fetchMCPResourceHtml(
  serverName: string,
  uri: string,
): Promise<{
  html: string;
  csp?: ResourceUiMeta['csp'];
  permissions?: ResourceUiMeta['permissions'];
}> {
  const result = (await readMCPResource(serverName, uri)) as {
    contents?: Array<{
      uri?: string;
      mimeType?: string;
      text?: string;
      blob?: string;
      _meta?: { ui?: ResourceUiMeta };
    }>;
  };
  const contents = result?.contents ?? [];
  // A server may return auxiliary items alongside the app document, in any order, so pick the entry
  // for the requested URI (preferring the MCP App profile) rather than trusting response order;
  // otherwise the wrong document renders under the wrong CSP and permissions.
  const item =
    contents.find((c) => c.uri === uri && isMcpAppMimeType(c.mimeType)) ??
    contents.find((c) => c.uri === uri) ??
    contents.find((c) => isMcpAppMimeType(c.mimeType)) ??
    contents[0];
  const uiMeta = item?._meta?.ui;
  let html = item?.text ?? '';
  if (!html && typeof item?.blob === 'string' && item.blob) {
    try {
      html = decodeBase64Utf8(item.blob);
    } catch {
      html = '';
    }
  }
  return {
    html,
    csp: uiMeta?.csp,
    permissions: uiMeta?.permissions,
  };
}
