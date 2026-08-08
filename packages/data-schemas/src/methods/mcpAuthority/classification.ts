export const MCP_AUTHORITY_OAUTH_TOKEN_TYPES = [
  'mcp_oauth',
  'mcp_oauth_refresh',
  'mcp_oauth_client',
] as const;

export type MCPAuthorityOAuthTokenType = (typeof MCP_AUTHORITY_OAUTH_TOKEN_TYPES)[number];

export const MCP_AUTHORITY_USER_PLACEHOLDER_FIELDS = [
  'id',
  'name',
  'username',
  'email',
  'provider',
  'role',
  'googleId',
  'facebookId',
  'openidId',
  'samlId',
  'ldapId',
  'githubId',
  'discordId',
  'appleId',
  'emailVerified',
  'twoFactorEnabled',
  'termsAccepted',
  'termsAcceptedAt',
] as const;

const mcpOAuthTokenTypes = new Set<string>(MCP_AUTHORITY_OAUTH_TOKEN_TYPES);

export function isMCPAuthorityOAuthTokenType(type: string | undefined): boolean {
  return type !== undefined && mcpOAuthTokenTypes.has(type);
}
