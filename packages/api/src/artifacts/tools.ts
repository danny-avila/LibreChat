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
