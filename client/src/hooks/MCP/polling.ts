import type {
  MCPServerStatus,
  MCPOAuthStatusResponse,
  MCPReinitializeResponse,
} from 'librechat-data-provider';

export type MCPOAuthPollingOutcome = 'pending' | 'completed' | 'failed';

export function getMCPOAuthTimeout(
  attemptTimeout: number | undefined,
  connectionTimeout: number | undefined,
  fallback = 600_000,
): number {
  return attemptTimeout ?? connectionTimeout ?? fallback;
}

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

/** An active flow endpoint is newer and more specific than cached connection status. */
export function shouldUseMCPConnectionStatus(
  flowId: string | undefined,
  terminalFlowError: boolean,
): boolean {
  return !flowId || terminalFlowError;
}

/** A legacy pod's missing flow route is not terminal while shared fallback state is active. */
export function shouldFailMCPOAuthFallback(
  terminalFlowError: boolean,
  serverStatus: MCPServerStatus | undefined,
): boolean {
  if (!terminalFlowError) {
    return false;
  }
  return (
    serverStatus?.authorizationState !== 'authorizing' &&
    serverStatus?.connectionState !== 'connecting'
  );
}

/** OAuth completion proves credentials were stored; reinitialization proves this request pod can use them. */
export function isMCPReadyAfterOAuth(response: MCPReinitializeResponse): boolean {
  return response.success && response.oauthRequired !== true;
}
