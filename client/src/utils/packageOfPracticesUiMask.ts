import { actionDelimiter, Constants, ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';

export const PACKAGE_OF_PRACTICES_TOOL_BASE = 'get_context_from_package_of_practices';

/** MCP server keys in librechat.yaml that host the PoP tools. */
export const PACKAGE_OF_PRACTICES_MCP_SERVER_IDS = ['pop', 'pop-tool'] as const;

/** Shown in the UI only; stored message content is unchanged. */
export const PACKAGE_OF_PRACTICES_UI_MESSAGE = `# We do not have sufficient information to answer your query at the moment. Your query has been transferred to an expert and will be processed within 2 hours. Please ask the same query after 2 hours.`;

/**
 * Base function name for matching, consistent with ToolCall.tsx (MCP / action delimiters).
 */
export function getToolCallBaseName(rawName: string): string {
  if (typeof rawName !== 'string' || rawName.length === 0) {
    return '';
  }
  if (rawName.includes(Constants.mcp_delimiter)) {
    const [func] = rawName.split(Constants.mcp_delimiter);
    return func || '';
  }
  const [func] = rawName.includes(actionDelimiter) ? rawName.split(actionDelimiter) : [rawName];
  return func || '';
}

export function getMcpServerSuffix(rawName: string): string | null {
  if (!rawName.includes(Constants.mcp_delimiter)) {
    return null;
  }
  const parts = rawName.split(Constants.mcp_delimiter);
  return parts[1] ?? null;
}

export function isPopMcpServerId(serverId: string | null | undefined): boolean {
  if (!serverId) {
    return false;
  }
  return (PACKAGE_OF_PRACTICES_MCP_SERVER_IDS as readonly string[]).includes(serverId);
}

export function isPackageOfPracticesToolName(rawName: string | null | undefined): boolean {
  if (!rawName) {
    return false;
  }
  if (getToolCallBaseName(rawName) === PACKAGE_OF_PRACTICES_TOOL_BASE) {
    return true;
  }
  const mcpSuffix = getMcpServerSuffix(rawName);
  if (isPopMcpServerId(mcpSuffix) && rawName.includes(PACKAGE_OF_PRACTICES_TOOL_BASE)) {
    return true;
  }
  return false;
}

/** When API/DB returns `content` as a JSON string of parts, normalize for scanning. */
export function normalizeMessageContentParts(
  raw: Array<TMessageContentParts | undefined> | string | undefined | null,
): Array<TMessageContentParts | undefined> {
  if (raw == null) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw !== 'string') {
    return [];
  }
  const t = raw.trim();
  if (!t.startsWith('[')) {
    return [];
  }
  try {
    const parsed = JSON.parse(t) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<TMessageContentParts | undefined>) : [];
  } catch {
    return [];
  }
}

function getToolCallPayloadFromPart(part: TMessageContentParts): unknown {
  const withToolCall = part as { tool_call?: unknown; toolCall?: unknown };
  if (withToolCall.tool_call != null) {
    return withToolCall.tool_call;
  }
  if (withToolCall.toolCall != null) {
    return withToolCall.toolCall;
  }
  const keyed = (part as Record<string, unknown>)[ContentTypes.TOOL_CALL];
  return keyed ?? null;
}

export function messageContentHasPopTool(
  raw: Array<TMessageContentParts | undefined> | string | undefined | null,
): boolean {
  const parts = normalizeMessageContentParts(raw);
  for (const p of parts) {
    if (!p) {
      continue;
    }
    const payload = getToolCallPayloadFromPart(p);
    if (payload != null && typeof payload === 'object') {
      const o = payload as { name?: string; function?: { name?: string } };
      if (isPackageOfPracticesToolName(o.name)) {
        return true;
      }
      if (o.function && isPackageOfPracticesToolName(o.function.name)) {
        return true;
      }
    }
  }
  if (raw == null) {
    return false;
  }
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (!s.includes(PACKAGE_OF_PRACTICES_TOOL_BASE)) {
      return false;
    }
    for (const serverId of PACKAGE_OF_PRACTICES_MCP_SERVER_IDS) {
      if (s.includes(`${PACKAGE_OF_PRACTICES_TOOL_BASE}${Constants.mcp_delimiter}${serverId}`)) {
        return true;
      }
    }
    return /"name"\s*:\s*"[^"]*get_context_from_package_of_practices/.test(s);
  } catch {
    return false;
  }
}
