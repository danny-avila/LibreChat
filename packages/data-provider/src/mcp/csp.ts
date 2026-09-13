/** Maximum serialized resource CSP accepted by both the host and sandbox response boundary. */
export const MCP_APP_CSP_MAX_LENGTH = 4096;

/** Maximum number of sources emitted for any one MCP App CSP directive. */
export const MCP_APP_CSP_MAX_DOMAINS = 32;

export type MCPAppCspDeclaration = {
  resourceDomains?: string[];
  connectDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
};

const MCP_APP_CSP_SOURCE_PATTERN =
  /^(?:(?:https?|wss?):\/\/)?(?:\*\.)?[a-zA-Z0-9][a-zA-Z0-9\-.]*(?::(?:\d{1,5}|\*))?(?:\/[^\s;,'"?#]*)?$/i;

const normalizeCspSources = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const sources = value
    .map((source) => (typeof source === 'string' ? source.trim() : ''))
    .filter((source) => source.length > 0 && MCP_APP_CSP_SOURCE_PATTERN.test(source))
    .slice(0, MCP_APP_CSP_MAX_DOMAINS);
  return sources.length > 0 ? sources : undefined;
};

/**
 * Canonical declaration used for sandbox serialization, response policies, and host link checks.
 * Host link matching remains intentionally narrower than this CSP source grammar.
 */
export function normalizeMCPAppCspDeclaration(value: unknown): MCPAppCspDeclaration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const input = value as Record<keyof MCPAppCspDeclaration, unknown>;
  const normalized: MCPAppCspDeclaration = {};
  for (const key of [
    'resourceDomains',
    'connectDomains',
    'frameDomains',
    'baseUriDomains',
  ] as const) {
    const sources = normalizeCspSources(input[key]);
    if (sources) {
      normalized[key] = sources;
    }
  }
  return normalized;
}
