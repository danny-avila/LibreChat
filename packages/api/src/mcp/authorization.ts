import type { MCPRecoveryGenerationScope } from './catalog/recovery';
import { publishMCPAuthorizationMutation } from './catalog/recovery';

export interface FinalizeMCPAuthorizationMutationParams {
  scope: MCPRecoveryGenerationScope;
  mutationResults: readonly unknown[];
  /** Teardown also fences when the credential delete itself was a no-op or failed. */
  teardown?: boolean;
}

export interface FinalizeMCPAuthorizationMutationDeps {
  invalidateRecoveryGeneration: (scope: MCPRecoveryGenerationScope) => Promise<unknown>;
  clearLocalRecovery?: (userId: string, serverName: string) => void;
  persistPublicationRetry?: (scope: MCPRecoveryGenerationScope) => Promise<string>;
  clearPublicationRetry?: (scope: MCPRecoveryGenerationScope, version: string) => Promise<void>;
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
    settleFlowIfCurrent?: (
      flowId: string,
      type: 'mcp_get_tokens',
      expectedCreatedAt: number,
      expectedState: string,
      tokens: TTokens,
    ) => Promise<'updated' | 'stale' | 'missing'>;
  };
  onTokenFlowError?: (phase: 'prepare' | 'complete', error: unknown) => void;
}

interface PendingTokenFlowAttempt {
  flowId: string;
  createdAt: number;
  state: string;
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
  const pendingFlows: PendingTokenFlowAttempt[] = [];
  const { flowManager } = deps;
  if (
    typeof flowManager.getFlowState === 'function' &&
    typeof flowManager.deleteFlow === 'function'
  ) {
    for (const flowId of new Set(params.flowIds)) {
      try {
        const state = (await flowManager.getFlowState(flowId, 'mcp_get_tokens')) as
          | { type?: string; status?: string; createdAt?: number; metadata?: { state?: unknown } }
          | null
          | undefined;
        if (
          state?.type === 'mcp_get_tokens' &&
          state.status === 'PENDING' &&
          typeof state.createdAt === 'number' &&
          typeof flowManager.settleFlowIfCurrent === 'function'
        ) {
          pendingFlows.push({
            flowId,
            createdAt: state.createdAt,
            state: typeof state.metadata?.state === 'string' ? state.metadata.state : '',
          });
        } else {
          await flowManager.deleteFlow(flowId, 'mcp_get_tokens');
        }
      } catch (error) {
        deps.onTokenFlowError?.('prepare', error);
      }
    }
  }

  await params.completeAuthorization(params.tokens);

  for (const pending of pendingFlows) {
    try {
      const result = await flowManager.settleFlowIfCurrent?.(
        pending.flowId,
        'mcp_get_tokens',
        pending.createdAt,
        pending.state,
        params.tokens,
      );
      if (result !== 'updated') {
        throw new Error(`Pending MCP token flow was ${result}`);
      }
    } catch (error) {
      deps.onTokenFlowError?.('complete', error);
    }
  }
}

export interface PersistMCPAuthorizationTransactionParams<TTokens> {
  scope: MCPRecoveryGenerationScope;
  flowIds: readonly string[];
  tokens: TTokens;
  completeAuthorization: (tokens: TTokens) => Promise<void>;
  persistTokens: (
    tokens: TTokens,
    onStoreCommitted: (tokens: TTokens) => Promise<void>,
  ) => Promise<TTokens>;
}

export interface PersistMCPAuthorizationTransactionDeps<TTokens>
  extends CompleteMCPAuthorizationWithTokenWaitersDeps<TTokens> {
  ensureServerActive: () => Promise<boolean>;
  inactiveServerError: () => Error;
  invalidateRecoveryGeneration: (scope: MCPRecoveryGenerationScope) => Promise<unknown>;
  clearLocalRecovery?: (userId: string, serverName: string) => void;
  persistPublicationRetry?: (scope: MCPRecoveryGenerationScope) => Promise<string>;
  clearPublicationRetry?: (scope: MCPRecoveryGenerationScope, version: string) => Promise<void>;
  retryDelaysMs?: readonly number[];
  attemptTimeoutMs?: number;
}

/** Owns the OAuth authorization transaction while the token store's rollback journal is live. */
export async function persistMCPAuthorizationTransaction<TTokens>(
  params: PersistMCPAuthorizationTransactionParams<TTokens>,
  deps: PersistMCPAuthorizationTransactionDeps<TTokens>,
): Promise<TTokens> {
  return params.persistTokens(params.tokens, async (committedTokens) => {
    if (!(await deps.ensureServerActive())) {
      throw deps.inactiveServerError();
    }
    await publishMCPAuthorizationMutation(params.scope, {
      invalidateRecoveryGeneration: deps.invalidateRecoveryGeneration,
      clearLocalRecovery: deps.clearLocalRecovery,
      persistPublicationRetry: deps.persistPublicationRetry,
      clearPublicationRetry: deps.clearPublicationRetry,
      retryDelaysMs: deps.retryDelaysMs,
      attemptTimeoutMs: deps.attemptTimeoutMs,
    });
    await completeMCPAuthorizationWithTokenWaiters(
      {
        flowIds: params.flowIds,
        tokens: committedTokens,
        completeAuthorization: params.completeAuthorization,
      },
      deps,
    );
  });
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
      persistPublicationRetry: deps.persistPublicationRetry,
      clearPublicationRetry: deps.clearPublicationRetry,
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
