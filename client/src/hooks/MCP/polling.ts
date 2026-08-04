import type { MCPOAuthStatusResponse } from 'librechat-data-provider';

export type MCPOAuthPollingOutcome = 'pending' | 'completed' | 'failed';

export function getMCPOAuthPollingOutcome(status: MCPOAuthStatusResponse): MCPOAuthPollingOutcome {
  if (status.completed || status.status === 'COMPLETED') {
    return 'completed';
  }
  if (status.failed || status.status === 'FAILED') {
    return 'failed';
  }
  return 'pending';
}
