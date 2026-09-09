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

export interface CompleteMCPAuthorizationWithTokenWaitersParams<TTokens> {
  flowIds: readonly string[];
  tokens: TTokens;
  completeAuthorization: (tokens: TTokens) => Promise<void>;
}

export interface CompleteMCPAuthorizationWithTokenWaitersDeps<TTokens> {
  flowManager: {
    getFlowState?: (flowId: string, type: 'mcp_get_tokens') => Promise<unknown>;
    deleteFlow?: (flowId: string, type: 'mcp_get_tokens') => Promise<unknown>;
    completeFlow?: (flowId: string, type: 'mcp_get_tokens', tokens: TTokens) => Promise<unknown>;
  };
  onTokenFlowError?: (phase: 'prepare' | 'complete', error: unknown) => void;
}

/**
 * Settles the guarded OAuth flow before exposing its tokens to connection-factory waiters. Stale
 * token-flow results are removed before settlement, while live waiters are retained and woken only
 * after the authorization completion can no longer roll the credential write back.
 */
export async function completeMCPAuthorizationWithTokenWaiters<TTokens>(
  params: CompleteMCPAuthorizationWithTokenWaitersParams<TTokens>,
  deps: CompleteMCPAuthorizationWithTokenWaitersDeps<TTokens>,
): Promise<void> {
  const pendingFlowIds: string[] = [];
  const { flowManager } = deps;
  if (
    typeof flowManager.getFlowState === 'function' &&
    typeof flowManager.deleteFlow === 'function' &&
    typeof flowManager.completeFlow === 'function'
  ) {
    for (const flowId of new Set(params.flowIds)) {
      try {
        const state = (await flowManager.getFlowState(flowId, 'mcp_get_tokens')) as
          | { type?: string; status?: string }
          | null
          | undefined;
        if (state?.type === 'mcp_get_tokens' && state.status === 'PENDING') {
          pendingFlowIds.push(flowId);
        } else {
          await flowManager.deleteFlow(flowId, 'mcp_get_tokens');
        }
      } catch (error) {
        deps.onTokenFlowError?.('prepare', error);
      }
    }
  }

  await params.completeAuthorization(params.tokens);

  for (const flowId of pendingFlowIds) {
    try {
      await flowManager.completeFlow?.(flowId, 'mcp_get_tokens', params.tokens);
    } catch (error) {
      deps.onTokenFlowError?.('complete', error);
    }
  }
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
