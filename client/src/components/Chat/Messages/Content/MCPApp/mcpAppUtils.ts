export interface McpUiResourceCsp {
  resourceDomains?: string[];
  connectDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

type PermissionGrant = Record<string, never> | boolean;
export interface McpUiResourcePermissions {
  camera?: PermissionGrant;
  microphone?: PermissionGrant;
  geolocation?: PermissionGrant;
  clipboardWrite?: PermissionGrant;
}

/**
 * Build Content Security Policy string from MCP App resource metadata.
 * This is kept for compatibility helpers and mirrors the policy generated in the sandbox proxy.
 */
export function buildCSP(csp?: McpUiResourceCsp, serverOrigin?: string): string {
  // Collect all allowed origins: declared resourceDomains + the MCP server's own origin
  const origins = [...(csp?.resourceDomains || [])];
  if (serverOrigin) {
    origins.push(serverOrigin);
  }
  const resourceDomains = origins.join(' ');

  const connectOrigins = [...(csp?.connectDomains || [])];
  if (serverOrigin) {
    connectOrigins.push(serverOrigin);
  }
  const connectDomains = connectOrigins.join(' ');

  const frameDomains = csp?.frameDomains?.join(' ') || "'none'";
  const baseUri = csp?.baseUriDomains?.join(' ') || "'self'";

  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${resourceDomains}`.trim(),
    `style-src 'unsafe-inline' ${resourceDomains}`.trim(),
    `connect-src 'self' ${connectDomains}`.trim(),
    `img-src data: blob: ${resourceDomains}`.trim(),
    `font-src ${resourceDomains || "'none'"}`.trim(),
    `media-src data: ${resourceDomains}`.trim(),
    `frame-src ${frameDomains}`,
    "object-src 'none'",
    `base-uri ${baseUri}`,
  ].join('; ');
}

function hasPermission(permission?: PermissionGrant): boolean {
  return permission === true || (typeof permission === 'object' && permission != null);
}

/**
 * Normalize permissions to MCP Apps spec shape ({ feature: {} }).
 */
export function normalizePermissions(
  permissions?: McpUiResourcePermissions,
):
  | Partial<
      Record<'camera' | 'microphone' | 'geolocation' | 'clipboardWrite', Record<string, never>>
    >
  | undefined {
  const normalized: Partial<
    Record<'camera' | 'microphone' | 'geolocation' | 'clipboardWrite', Record<string, never>>
  > = {};
  if (hasPermission(permissions?.camera)) {
    normalized.camera = {};
  }
  if (hasPermission(permissions?.microphone)) {
    normalized.microphone = {};
  }
  if (hasPermission(permissions?.geolocation)) {
    normalized.geolocation = {};
  }
  if (hasPermission(permissions?.clipboardWrite)) {
    normalized.clipboardWrite = {};
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/**
 * Build iframe permissions/allow attribute from MCP resource permissions.
 */
export function buildPermissions(permissions?: McpUiResourcePermissions): string {
  const normalized = normalizePermissions(permissions);
  const allow: string[] = [];
  if (normalized?.camera) {
    allow.push('camera');
  }
  if (normalized?.microphone) {
    allow.push('microphone');
  }
  if (normalized?.geolocation) {
    allow.push('geolocation');
  }
  if (normalized?.clipboardWrite) {
    allow.push('clipboard-write');
  }
  return allow.join('; ');
}

/**
 * Fetch a resource from an MCP server via the backend proxy.
 * Uses axios so the JWT Authorization header is included automatically.
 */
export async function fetchMCPResource(
  serverName: string,
  uri: string,
): Promise<{
  contents: Array<{
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: Record<string, unknown>;
  }>;
}> {
  const { request } = await import('librechat-data-provider');
  return request.post('/api/mcp/resources/read', { serverName, uri });
}

/**
 * Execute a tool call via the backend bridge proxy.
 * Uses axios so the JWT Authorization header is included automatically.
 */
export async function callMCPAppTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { request } = await import('librechat-data-provider');
  return request.post('/api/mcp/app-tool-call', { serverName, toolName, arguments: args });
}
