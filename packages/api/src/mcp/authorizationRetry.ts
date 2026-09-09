import { randomUUID } from 'crypto';
import { logger } from '@librechat/data-schemas';
import type { MCPRecoveryGenerationScope } from './catalog/recovery';
import { registerShutdownTask } from '~/app/shutdown';

const DEFAULT_RETRY_INTERVAL_MS = 30_000;
const DEFAULT_RETRY_BATCH_SIZE = 100;

export interface MCPAuthorizationFenceRetryRecord extends MCPRecoveryGenerationScope {
  tenantId?: string | null;
  version: string;
  updatedAt: Date;
}

export interface MCPAuthorizationFenceRetryStorage {
  upsert(input: {
    scope: MCPRecoveryGenerationScope;
    tenantId?: string | null;
    version: string;
    now: Date;
  }): Promise<void>;
  deleteVersion(input: {
    scope: MCPRecoveryGenerationScope;
    tenantId?: string | null;
    version: string;
  }): Promise<void>;
  list(limit: number): Promise<readonly MCPAuthorizationFenceRetryRecord[]>;
}

export interface MCPAuthorizationFenceRetryServiceDeps {
  storage: MCPAuthorizationFenceRetryStorage;
  getTenantId: () => string | null | undefined;
  runInRetryScope: (
    retry: MCPAuthorizationFenceRetryRecord,
    operation: () => Promise<void>,
  ) => Promise<void>;
  registerShutdown?: typeof registerShutdownTask;
}

export interface MCPAuthorizationFenceRetryWorkerPolicy {
  intervalMs?: number;
  batchSize?: number;
}

export interface MCPAuthorizationFenceRetryService {
  clear(scope: MCPRecoveryGenerationScope, version: string): Promise<void>;
  drain(): Promise<void>;
  persist(scope: MCPRecoveryGenerationScope): Promise<string>;
  start(
    invalidator: (scope: MCPRecoveryGenerationScope) => Promise<unknown>,
    policy?: MCPAuthorizationFenceRetryWorkerPolicy,
  ): void;
  stop(): Promise<void>;
}

/** Owns durable authorization-fence retry lifecycle independently of the legacy server adapter. */
export function createMCPAuthorizationFenceRetryService(
  deps: MCPAuthorizationFenceRetryServiceDeps,
): MCPAuthorizationFenceRetryService {
  let retryTimer: ReturnType<typeof setInterval> | undefined;
  let drainPromise: Promise<void> | undefined;
  let invalidateRecoveryGeneration:
    | ((scope: MCPRecoveryGenerationScope) => Promise<unknown>)
    | undefined;
  let retryBatchSize = DEFAULT_RETRY_BATCH_SIZE;

  const persist = async (scope: MCPRecoveryGenerationScope): Promise<string> => {
    const version = randomUUID();
    await deps.storage.upsert({
      scope,
      tenantId: deps.getTenantId() ?? null,
      version,
      now: new Date(),
    });
    return version;
  };

  const clear = async (scope: MCPRecoveryGenerationScope, version: string): Promise<void> => {
    await deps.storage.deleteVersion({
      scope,
      tenantId: deps.getTenantId() ?? null,
      version,
    });
  };

  const drain = async (): Promise<void> => {
    if (drainPromise != null || invalidateRecoveryGeneration == null) {
      return drainPromise;
    }
    drainPromise = (async () => {
      const retries = await deps.storage.list(retryBatchSize);
      for (const retry of retries) {
        try {
          await deps.runInRetryScope(retry, async () => {
            await invalidateRecoveryGeneration?.({
              userId: retry.userId,
              serverName: retry.serverName,
            });
          });
          await deps.storage.deleteVersion({
            scope: { userId: retry.userId, serverName: retry.serverName },
            tenantId: retry.tenantId,
            version: retry.version,
          });
        } catch (error) {
          logger.warn(
            `[MCP authorization] Durable generation retry failed for ${retry.serverName}`,
            error,
          );
        }
      }
    })().finally(() => {
      drainPromise = undefined;
    });
    return drainPromise;
  };

  const scheduleDrain = (): void => {
    void drain().catch((error) =>
      logger.warn('[MCP authorization] Could not read durable generation retries', error),
    );
  };

  const stop = async (): Promise<void> => {
    if (retryTimer != null) {
      clearInterval(retryTimer);
      retryTimer = undefined;
    }
    await drainPromise?.catch(() => undefined);
  };

  const start = (
    invalidator: (scope: MCPRecoveryGenerationScope) => Promise<unknown>,
    policy: MCPAuthorizationFenceRetryWorkerPolicy = {},
  ): void => {
    invalidateRecoveryGeneration = invalidator;
    retryBatchSize = policy.batchSize ?? DEFAULT_RETRY_BATCH_SIZE;
    if (retryTimer != null) {
      return;
    }
    retryTimer = setInterval(scheduleDrain, policy.intervalMs ?? DEFAULT_RETRY_INTERVAL_MS);
    retryTimer.unref?.();
    (deps.registerShutdown ?? registerShutdownTask)('MCP authorization fence retry worker', stop);
    scheduleDrain();
  };

  return { clear, drain, persist, start, stop };
}
