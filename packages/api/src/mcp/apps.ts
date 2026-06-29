/**
 * MCP Apps tool-metadata helpers, mirrored from the spec's reference
 * implementation in `@modelcontextprotocol/ext-apps`. They are reimplemented
 * here so `@librechat/api` (emitted as CommonJS) never statically imports the
 * ESM-only ext-apps package; the client bundle keeps importing ext-apps directly.
 */

interface ToolWithMeta {
  _meta?: Record<string, unknown> | null;
}

type McpUiToolVisibility = 'model' | 'app';

interface McpUiToolMeta {
  resourceUri?: string;
  visibility?: McpUiToolVisibility[];
}

/** Deprecated flat metadata key for a tool's UI resource URI. */
export const RESOURCE_URI_META_KEY = 'ui/resourceUri';

/** MIME type identifying HTML content as an MCP App UI resource. */
export const RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * Extract a tool's UI resource URI. Prefers the nested `_meta.ui.resourceUri`
 * format and falls back to the deprecated flat `_meta["ui/resourceUri"]`.
 * Throws if a URI is present but does not use the `ui://` scheme.
 */
export function getToolUiResourceUri(tool: ToolWithMeta): string | undefined {
  const uiMeta = tool._meta?.ui as McpUiToolMeta | undefined;
  let uri: unknown = uiMeta?.resourceUri;

  if (uri === undefined) {
    uri = tool._meta?.[RESOURCE_URI_META_KEY];
  }

  if (typeof uri === 'string' && uri.startsWith('ui://')) {
    return uri;
  } else if (uri !== undefined) {
    throw new Error(`Invalid UI resource URI: ${JSON.stringify(uri)}`);
  }
  return undefined;
}

/** True when a tool is exposed to the model only (never callable from an app). */
export function isToolVisibilityModelOnly(tool: ToolWithMeta): boolean {
  const visibility = (tool._meta?.ui as McpUiToolMeta | undefined)?.visibility;
  return Array.isArray(visibility) && visibility.length === 1 && visibility[0] === 'model';
}

/** True when a tool is exposed to the app only (hidden from the model). */
export function isToolVisibilityAppOnly(tool: ToolWithMeta): boolean {
  const visibility = (tool._meta?.ui as McpUiToolMeta | undefined)?.visibility;
  return Array.isArray(visibility) && visibility.length === 1 && visibility[0] === 'app';
}
