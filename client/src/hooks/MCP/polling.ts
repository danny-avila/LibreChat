import type { MCPOAuthStatusResponse } from 'librechat-data-provider';

export type MCPOAuthPollingOutcome = 'pending' | 'completed' | 'failed';

/**
 * A missing or unauthorized flow is terminal for this browser poll. Retrying it
 * forever leaves the OAuth spinner active after the shared flow record is gone.
 */
export function isTerminalMCPOAuthPollingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const responseStatus = (error as { response?: { status?: unknown } }).response?.status;
  const status =
    typeof responseStatus === 'number' ? responseStatus : (error as { status?: unknown }).status;
  return status === 403 || status === 404;
}

export function getMCPOAuthPollingOutcome(status: MCPOAuthStatusResponse): MCPOAuthPollingOutcome {
  if (status.completed || status.status === 'COMPLETED') {
    return 'completed';
  }
  if (status.failed || status.status === 'FAILED') {
    return 'failed';
  }
  return 'pending';
}
