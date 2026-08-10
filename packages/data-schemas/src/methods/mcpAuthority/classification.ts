import { MCP_USER_PLACEHOLDER_FIELDS } from 'librechat-data-provider';

export { MCP_USER_PLACEHOLDER_FIELDS as MCP_AUTHORITY_USER_PLACEHOLDER_FIELDS };

export const MCP_AUTHORITY_USER_SOURCE_FIELDS: readonly (
  | (typeof MCP_USER_PLACEHOLDER_FIELDS)[number]
  | 'tenantId'
  | 'idOnTheSource'
  | 'openidIssuer'
)[] = [...MCP_USER_PLACEHOLDER_FIELDS, 'tenantId', 'idOnTheSource', 'openidIssuer'] as const;

export const MCP_AUTHORITY_OAUTH_TOKEN_TYPES = [
  'mcp_oauth',
  'mcp_oauth_refresh',
  'mcp_oauth_client',
] as const;

export type MCPAuthorityOAuthTokenType = (typeof MCP_AUTHORITY_OAUTH_TOKEN_TYPES)[number];

const mcpOAuthTokenTypes = new Set<string>(MCP_AUTHORITY_OAUTH_TOKEN_TYPES);

export function isMCPAuthorityOAuthTokenType(type: string | undefined): boolean {
  return type !== undefined && mcpOAuthTokenTypes.has(type);
}
