/**
 * MCP-specific error classes
 */

export const MCPErrorCodes = {
  DOMAIN_NOT_ALLOWED: 'MCP_DOMAIN_NOT_ALLOWED',
  INSPECTION_FAILED: 'MCP_INSPECTION_FAILED',
  OAUTH_SECRET_REENTRY_REQUIRED: 'MCP_OAUTH_SECRET_REENTRY_REQUIRED',
} as const;

export type MCPErrorCode = (typeof MCPErrorCodes)[keyof typeof MCPErrorCodes];

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
