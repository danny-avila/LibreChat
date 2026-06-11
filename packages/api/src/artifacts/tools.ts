import { Constants } from 'librechat-data-provider';

/** Outcome of authorizing a live-artifact tool call against its file allowlist. */
export type ArtifactToolAuthorization =
  | { allowed: true; serverName: string; toolName: string }
  | { allowed: false; reason: 'not_allowed' | 'not_mcp' };

/** True when a tool key follows the MCP convention `<tool>_mcp_<server>`. */
export const isMcpToolKey = (tool: string): boolean =>
  tool.includes(Constants.mcp_delimiter as string);

/** Split an MCP tool key into its tool and server parts, or null if malformed. */
export const parseMcpToolKey = (tool: string): { toolName: string; serverName: string } | null => {
  const delimiter = Constants.mcp_delimiter as string;
  const index = tool.indexOf(delimiter);
  if (index === -1) {
    return null;
  }
  const toolName = tool.slice(0, index);
  const serverName = tool.slice(index + delimiter.length);
  if (!toolName || !serverName) {
    return null;
  }
  return { toolName, serverName };
};

export const isToolAllowed = (allowlist: string[] | undefined, tool: string): boolean =>
  Array.isArray(allowlist) && allowlist.includes(tool);

/**
 * Normalize a model-supplied `mcp_tools` value into a deduped list of
 * well-formed MCP tool keys. Drops non-strings and non-MCP entries — the
 * authoring-time gate that keeps `file.metadata.mcpTools` clean. Returns `[]`
 * for anything that isn't a usable allowlist.
 */
export const sanitizeMcpToolList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const tools: string[] = [];
  for (const entry of value) {
    // `parseMcpToolKey` (not `isMcpToolKey`) so malformed keys like
    // `_mcp_github` or `tool_mcp_` — which would always fail authorization —
    // never reach `file.metadata.mcpTools`.
    if (typeof entry === 'string' && parseMcpToolKey(entry) !== null && !seen.has(entry)) {
      seen.add(entry);
      tools.push(entry);
    }
  }
  return tools;
};

/**
 * Decide whether a live artifact may call `tool`. The allowlist is the
 * `mcpTools` array stored on the artifact's file record
 * (`file.metadata.mcpTools`) — server-stored, so a tampered client cannot widen
 * it. Kept pure so it is exhaustively testable.
 *
 * - `not_allowed`: the tool is absent from the file's allowlist.
 * - `not_mcp`: the tool is allowlisted but is not an MCP tool key.
 */
export const authorizeArtifactToolCall = (
  allowlist: string[] | undefined,
  tool: string,
): ArtifactToolAuthorization => {
  if (!isToolAllowed(allowlist, tool)) {
    return { allowed: false, reason: 'not_allowed' };
  }
  const parsed = parseMcpToolKey(tool);
  if (!parsed) {
    return { allowed: false, reason: 'not_mcp' };
  }
  return { allowed: true, serverName: parsed.serverName, toolName: parsed.toolName };
};
