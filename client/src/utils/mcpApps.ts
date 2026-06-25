import { request, apiBaseUrl } from 'librechat-data-provider';
import type { UIResource } from 'librechat-data-provider';

export type AppToolResult = {
  content: [];
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
  return (
    !!resource.toolName &&
    !!resource.serverName &&
    (resource.mimeType ?? '').includes('profile=mcp-app')
  );
}

/**
 * Builds the App Bridge tool result from a UI resource. App-backed resources (toolName +
 * serverName) always produce a result so the app's ontoolresult fires even for empty output,
 * and the tool result's _meta is forwarded for apps that hydrate from it.
 */
export function buildAppToolResult(resource: UIResource): AppToolResult | undefined {
  const sc = resource.structuredContent as Record<string, unknown> | undefined | null;
  const content = (resource.content as [] | undefined) ?? [];
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
  const configured = (import.meta.env as Record<string, string | undefined>).VITE_MCP_SANDBOX_URL;
  const base = configured ?? `${apiBaseUrl()}/api/mcp/sandbox`;
  try {
    const url = new URL(base, window.location.origin);
    url.searchParams.set('parentOrigin', window.location.origin);
    return url.toString();
  } catch {
    return base;
  }
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

export async function fetchMCPResourceHtml(
  serverName: string,
  uri: string,
): Promise<{
  html: string;
  csp?: ResourceUiMeta['csp'];
  permissions?: ResourceUiMeta['permissions'];
}> {
  const result = (await readMCPResource(serverName, uri)) as {
    contents?: Array<{ text?: string; blob?: string; _meta?: { ui?: ResourceUiMeta } }>;
  };
  const item = result?.contents?.[0];
  const uiMeta = item?._meta?.ui;
  let html = item?.text ?? '';
  if (!html && typeof item?.blob === 'string' && item.blob) {
    try {
      // Decode base64 as UTF-8 so non-ASCII HTML (localized text, inline JSON) is not mojibake;
      // atob alone yields a Latin-1 string.
      const bytes = Uint8Array.from(atob(item.blob), (char) => char.charCodeAt(0));
      html = new TextDecoder('utf-8').decode(bytes);
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
