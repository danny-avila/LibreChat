import { publishMCPAuthorizationMutation } from './catalog/recovery';
import type { MCPRecoveryGenerationScope } from './catalog/recovery';

export interface FinalizeMCPAuthorizationMutationParams {
  scope: MCPRecoveryGenerationScope;
  mutationResults: readonly unknown[];
  /** Teardown also fences when the credential delete itself was a no-op or failed. */
  teardown?: boolean;
}

export interface FinalizeMCPAuthorizationMutationDeps {
  invalidateRecoveryGeneration: (scope: MCPRecoveryGenerationScope) => Promise<unknown>;
  clearLocalRecovery?: (userId: string, serverName: string) => void;
  disconnectUserConnection: (userId: string, serverName: string) => Promise<void>;
  retryDelaysMs?: readonly number[];
  attemptTimeoutMs?: number;
  afterDisconnect?: () => Promise<void>;
  onDisconnectError?: (error: unknown) => void;
}

/**
 * Publishes every committed credential batch before disconnecting its live connection. Partial
 * batches still advance the generation, and teardown runs the same sequence even when its
 * credential delete did not commit so OAuth token cleanup cannot race an old connection.
 */
export async function finalizeMCPAuthorizationMutation(
  params: FinalizeMCPAuthorizationMutationParams,
  deps: FinalizeMCPAuthorizationMutationDeps,
): Promise<boolean> {
  const committed = params.mutationResults.some((result) => !(result instanceof Error));
  if (!committed && params.teardown !== true) {
    return false;
  }

  let publicationError: unknown;
  let publicationFailed = false;
  try {
    await publishMCPAuthorizationMutation(params.scope, {
      invalidateRecoveryGeneration: deps.invalidateRecoveryGeneration,
      clearLocalRecovery: deps.clearLocalRecovery,
      retryDelaysMs: deps.retryDelaysMs,
      attemptTimeoutMs: deps.attemptTimeoutMs,
    });
  } catch (error) {
    publicationFailed = true;
    publicationError = error;
  }

  try {
    await deps.disconnectUserConnection(params.scope.userId, params.scope.serverName);
  } catch (error) {
    deps.onDisconnectError?.(error);
  }

  await deps.afterDisconnect?.();

  if (publicationFailed) {
    throw publicationError;
  }
  return committed;
}
