/**
 * MCP-specific error classes
 */

export const MCPErrorCodes = {
  DOMAIN_NOT_ALLOWED: 'MCP_DOMAIN_NOT_ALLOWED',
  INSPECTION_FAILED: 'MCP_INSPECTION_FAILED',
  OAUTH_SECRET_REENTRY_REQUIRED: 'MCP_OAUTH_SECRET_REENTRY_REQUIRED',
} as const;

export type MCPErrorCode = (typeof MCPErrorCodes)[keyof typeof MCPErrorCodes];

interface OAuthErrorLike {
  code?: number;
  status?: number;
  statusCode?: number;
  message?: string;
}

const OAUTH_HTTP_STATUS_PATTERN =
  /(?:\bhttp\s+(?:401|403)\b|\bnon-2\d\d\s+status\s+code\s*\((?:401|403)\)|^(?:error:\s*)?(?:401|403)\b|\bunauthorized\s*\(\s*401\s*\)|\bforbidden\s*\(\s*403\s*\))/i;
const MISSING_AUTHORIZATION_PATTERN = /\bno authorization (?:headers?|values?)\b/i;

/** Detects HTTP authentication failures and OAuth protocol errors without matching unrelated IDs. */
export function isOAuthAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as OAuthErrorLike;
  if (
    [candidate.status, candidate.statusCode, candidate.code].some(
      (status) => status === 401 || status === 403,
    )
  ) {
    return true;
  }

  if (typeof candidate.message !== 'string') {
    return false;
  }

  const message = candidate.message.toLowerCase();
  return (
    OAUTH_HTTP_STATUS_PATTERN.test(message) ||
    message.includes('invalid_token') ||
    message.includes('invalid_grant') ||
    message.includes('insufficient_scope') ||
    message.includes('authentication required') ||
    MISSING_AUTHORIZATION_PATTERN.test(message)
  );
}

/**
 * Custom error for MCP domain restriction violations.
 * Thrown when a user attempts to connect to an MCP server whose domain is not in the allowlist.
 */
export class MCPDomainNotAllowedError extends Error {
  public readonly code: 'MCP_DOMAIN_NOT_ALLOWED' = MCPErrorCodes.DOMAIN_NOT_ALLOWED;
  public readonly statusCode = 403;
  public readonly domain: string;

  constructor(domain: string) {
    super(`Domain "${domain}" is not allowed`);
    this.name = 'MCPDomainNotAllowedError';
    this.domain = domain;
    Object.setPrototypeOf(this, MCPDomainNotAllowedError.prototype);
  }
}

/**
 * Custom error for MCP server inspection failures.
 * Thrown when attempting to connect/inspect an MCP server fails.
 */
export class MCPInspectionFailedError extends Error {
  public readonly code: 'MCP_INSPECTION_FAILED' = MCPErrorCodes.INSPECTION_FAILED;
  public readonly statusCode = 400;
  public readonly serverName: string;

  constructor(serverName: string, cause?: Error) {
    super(`Failed to connect to MCP server "${serverName}"`);
    this.name = 'MCPInspectionFailedError';
    this.serverName = serverName;
    if (cause) {
      this.cause = cause;
    }
    Object.setPrototypeOf(this, MCPInspectionFailedError.prototype);
  }
}

/** Raised when an update would move a retained OAuth client secret across trust boundaries. */
export class MCPOAuthSecretReentryRequiredError extends Error {
  public readonly code: 'MCP_OAUTH_SECRET_REENTRY_REQUIRED' =
    MCPErrorCodes.OAUTH_SECRET_REENTRY_REQUIRED;

  public readonly statusCode = 400;
  public readonly changedFields: readonly string[];

  constructor(changedFields: readonly string[]) {
    super(
      `Re-enter oauth.client_secret when changing OAuth credential binding fields: ${changedFields.join(', ')}`,
    );
    this.name = 'MCPOAuthSecretReentryRequiredError';
    this.changedFields = changedFields;
    Object.setPrototypeOf(this, MCPOAuthSecretReentryRequiredError.prototype);
  }
}

/**
 * Type guard to check if an error is an MCPDomainNotAllowedError
 */
export function isMCPDomainNotAllowedError(error: unknown): error is MCPDomainNotAllowedError {
  return error instanceof MCPDomainNotAllowedError;
}

/**
 * Type guard to check if an error is an MCPInspectionFailedError
 */
export function isMCPInspectionFailedError(error: unknown): error is MCPInspectionFailedError {
  return error instanceof MCPInspectionFailedError;
}

/** Type guard for OAuth client-secret binding violations. */
export function isMCPOAuthSecretReentryRequiredError(
  error: unknown,
): error is MCPOAuthSecretReentryRequiredError {
  return error instanceof MCPOAuthSecretReentryRequiredError;
}
