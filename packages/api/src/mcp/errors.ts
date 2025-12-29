/**
 * MCP-specific error classes
 */

export const MCPErrorCodes = {
  DOMAIN_NOT_ALLOWED: 'MCP_DOMAIN_NOT_ALLOWED',
  INSPECTION_FAILED: 'MCP_INSPECTION_FAILED',
} as const;

export type MCPErrorCode = (typeof MCPErrorCodes)[keyof typeof MCPErrorCodes];

/**
 * Custom error for MCP domain restriction violations.
 * Thrown when a user attempts to connect to an MCP server whose domain is not in the allowlist.
 */
export class MCPDomainNotAllowedError extends Error {
  public readonly code = MCPErrorCodes.DOMAIN_NOT_ALLOWED;
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
  public readonly code = MCPErrorCodes.INSPECTION_FAILED;
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
