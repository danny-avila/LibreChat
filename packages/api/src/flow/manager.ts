import { Keyv } from 'keyv';
import { logger } from '@librechat/data-schemas';
import type { StoredDataNoRaw } from 'keyv';
import type { FlowState, FlowMetadata, FlowManagerOptions } from './types';
import { registerShutdownTask } from '../app/shutdown';
import { math } from '~/utils/math';

/**
 * Lifetime of a PENDING OAuth flow: how long the auth button stays valid and an
 * in-flight flow can be reused before it is replaced. Mirrors
 * `mcpConfig.OAUTH_HANDLING_TIMEOUT` (`MCP_OAUTH_HANDLING_TIMEOUT`) so the reuse
 * window matches the wait the server grants the user. Default: 10 minutes.
 */
export const PENDING_STALE_MS: number = math(
  process.env.MCP_OAUTH_HANDLING_TIMEOUT ?? 10 * 60 * 1000,
);

const SECONDS_THRESHOLD = 1e10;

/**
 * A Keyv store that may optionally expose distributed lock helpers (see
 * `flowsCache` in `packages/api/src/cache/flows.ts`). Structurally typed here
 * rather than imported to avoid coupling the flow manager to the cache
 * package's Redis-detection internals.
 */
type LockableKeyv = Keyv & {
  acquireLock?: (key: string) => Promise<string | null>;
  releaseLock?: (key: string, token: string) => Promise<void>;
};

/**
 * Normalizes an expiration timestamp to milliseconds.
 * Timestamps below 10 billion are assumed to be in seconds (valid until ~2286).
 */
export function normalizeExpiresAt(timestamp: number): number {
  return timestamp < SECONDS_THRESHOLD ? timestamp * 1000 : timestamp;
}

/** How many times {@link FlowStateManager.completeFlowIfPending} retries the
 *  distributed lock before conceding. Covers the window where the holder has
 *  acquired the lock but not yet written the terminal state. */
const COMPLETE_LOCK_RETRY_MS = 50;
/** Must span the store's lock TTL (5s in `cache/flows.ts`): if the holder dies
 *  after acquiring the lock, nothing settles the flow until that TTL expires,
 *  and conceding earlier returns a 409 with no winning action while the flow is
 *  still PENDING. Retrying to the TTL lets a later attempt take the lock over. */
const COMPLETE_LOCK_TIMEOUT_MS = 6000;
const COMPLETE_LOCK_ATTEMPTS = Math.ceil(COMPLETE_LOCK_TIMEOUT_MS / COMPLETE_LOCK_RETRY_MS);

export class FlowStateManager<T = unknown> {
  private keyv: Keyv;
  private ttl: number;
  private monitorTimeout: number;
  private retainedFailureTypes: Set<string>;
  private intervals: Set<NodeJS.Timeout>;
  /**
   * Per-flowKey in-process mutex used by `completeFlowIfPending` as a fallback
   * when the store has no distributed `acquireLock`/`releaseLock` (in-memory
   * Keyv, or a Redis store without lock helpers attached). Guards against two
   * callers within the SAME process racing the PENDING->COMPLETED read-modify-
   * write; it does nothing to protect against a second process, which is why
   * the distributed lock is preferred whenever the store provides one.
   */
  private localLocks: Map<string, Promise<unknown>>;

  constructor(store: Keyv, options?: FlowManagerOptions) {
    if (!options) {
      options = { ttl: 60000 * 3 };
    }
    const { ci = false, ttl, monitorTimeout = ttl, retainedFailureTypes = [] } = options;

    if (!ci && !(store instanceof Keyv)) {
      throw new Error('Invalid store provided to FlowStateManager');
    }

    this.ttl = ttl;
    this.monitorTimeout = monitorTimeout;
    this.retainedFailureTypes = new Set(retainedFailureTypes);
    this.keyv = store;
    this.intervals = new Set();
    this.localLocks = new Map();

    if (!ci) {
      this.setupCleanupHandlers();
    }
  }

  /**
   * Serializes callers keyed by `key` within this process: each call waits for
   * the previous call (for the same key) to settle before running `fn`, so
   * concurrent callers never interleave their read-modify-write.
   */
  private async withLocalLock<R>(key: string, fn: () => Promise<R>): Promise<R> {
    const prior = this.localLocks.get(key) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    const tracked = run.catch(() => undefined);
    this.localLocks.set(key, tracked);
    try {
      return await run;
    } finally {
      if (this.localLocks.get(key) === tracked) {
        this.localLocks.delete(key);
      }
    }
  }

  private setupCleanupHandlers() {
    // Register cleanup with the centralized graceful-shutdown coordinator
    // (see ../app/shutdown.ts) rather than attaching direct signal
    // handlers — multiple competing handlers race the HTTP drain.
    registerShutdownTask('flow manager cleanup', () => {
      logger.info('Cleaning up FlowStateManager intervals...');
      this.intervals.forEach((interval) => clearInterval(interval));
      this.intervals.clear();
    });
  }

  /**
   * Flow keys are intentionally NOT tenant-scoped. OAuth callbacks arrive
   * without tenant ALS context (the provider redirect doesn't carry
   * X-Tenant-Id). Flow IDs are random UUIDs with no collision risk, and
   * flow data is ephemeral (TTL-bounded, no sensitive user content).
   */
  private getFlowKey(flowId: string, type: string): string {
    return `${type}:${flowId}`;
  }

  private isTokenExpired(flowState: FlowState<T> | undefined): boolean {
    if (!flowState?.result || typeof flowState.result !== 'object') {
      return false;
    }

    if (!('expires_at' in flowState.result)) {
      return false;
    }

    const expiresAt = (flowState.result as { expires_at: unknown }).expires_at;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      return false;
    }

    return normalizeExpiresAt(expiresAt) < Date.now();
  }

  /**
   * Stores initial PENDING flow state without starting the monitor loop.
   * Use this when you need to guarantee the state is persisted before
   * performing an action (e.g., an OAuth redirect), then call createFlow()
   * separately to start monitoring for completion.
   */
  async initFlow(flowId: string, type: string, metadata: FlowMetadata = {}): Promise<void> {
    const flowKey = this.getFlowKey(flowId, type);
    const initialState: FlowState = {
      type,
      status: 'PENDING',
      metadata,
      createdAt: Date.now(),
    };
    logger.debug(`[${flowKey}] Storing initial flow state`);
    await this.keyv.set(flowKey, initialState, this.ttl);
  }

  /**
   * Creates a new flow and waits for its completion
   */
  async createFlow(
    flowId: string,
    type: string,
    metadata: FlowMetadata = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const flowKey = this.getFlowKey(flowId, type);

    let existingState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
    if (existingState) {
      logger.debug(`[${flowKey}] Flow already exists`);
      return this.monitorFlow(flowKey, type, signal);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    existingState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
    if (existingState) {
      logger.debug(`[${flowKey}] Flow exists on 2nd check`);
      return this.monitorFlow(flowKey, type, signal);
    }

    const initialState: FlowState = {
      type,
      status: 'PENDING',
      metadata,
      createdAt: Date.now(),
    };

    logger.debug(`[${flowKey}] Creating initial flow state`);
    await this.keyv.set(flowKey, initialState, this.ttl);
    return this.monitorFlow(flowKey, type, signal);
  }

  private monitorFlow(flowKey: string, type: string, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const checkInterval = 2000;
      let isCleanedUp = false;
      let intervalId: NodeJS.Timeout | null = null;
      let missingStateRetried = false;
      let isRetrying = false;

      // Cleanup function to avoid duplicate cleanup
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        if (intervalId) {
          clearInterval(intervalId);
          this.intervals.delete(intervalId);
        }
        if (signal && abortHandler) {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      // Immediate abort handler - responds instantly to abort signal
      const abortHandler = async () => {
        cleanup();
        logger.warn(`[${flowKey}] Flow aborted (immediate)`);
        const message = `${type} flow aborted`;
        try {
          await this.keyv.delete(flowKey);
        } catch {
          // Ignore delete errors during abort
        }
        reject(new Error(message));
      };

      // Register abort handler immediately if signal provided
      if (signal) {
        if (signal.aborted) {
          // Already aborted, reject immediately
          cleanup();
          reject(new Error(`${type} flow aborted`));
          return;
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      intervalId = setInterval(async () => {
        if (isCleanedUp || isRetrying) return;

        try {
          let flowState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;

          if (!flowState) {
            if (!missingStateRetried) {
              missingStateRetried = true;
              isRetrying = true;
              logger.warn(
                `[${flowKey}] Flow state not found, retrying once after 500ms (race recovery)`,
              );
              await new Promise((r) => setTimeout(r, 500));
              flowState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
              isRetrying = false;
            }

            if (!flowState) {
              cleanup();
              logger.error(`[${flowKey}] Flow state not found after retry`);
              reject(new Error(`${type} Flow state not found`));
              return;
            }
          }

          if (signal?.aborted) {
            cleanup();
            logger.warn(`[${flowKey}] Flow aborted`);
            const message = `${type} flow aborted`;
            await this.keyv.delete(flowKey);
            reject(new Error(message));
            return;
          }

          if (flowState.status !== 'PENDING') {
            cleanup();
            logger.debug(`[${flowKey}] Flow completed`);

            if (flowState.status === 'COMPLETED' && flowState.result !== undefined) {
              resolve(flowState.result);
            } else if (flowState.status === 'FAILED') {
              if (!this.retainedFailureTypes.has(type)) {
                await this.keyv.delete(flowKey);
              }
              reject(new Error(flowState.error ?? `${type} flow failed`));
            }
            return;
          }

          const elapsedTime = Date.now() - flowState.createdAt;
          if (elapsedTime >= this.monitorTimeout) {
            cleanup();
            logger.error(
              `[${flowKey}] Flow timed out | Elapsed time: ${elapsedTime} | Timeout: ${this.monitorTimeout}`,
            );
            const message = `${type} flow timed out`;
            if (this.retainedFailureTypes.has(type)) {
              const remainingTtl = Math.max(1, this.ttl - elapsedTime);
              const timedOutState: FlowState<T> = {
                ...flowState,
                status: 'FAILED',
                error: message,
                failedAt: Date.now(),
              };
              await this.keyv.set(flowKey, timedOutState, remainingTtl);
            } else {
              await this.keyv.delete(flowKey);
            }
            reject(new Error(message));
            return;
          }
          logger.debug(`[${flowKey}] Flow state elapsed time: ${elapsedTime}, checking again...`);
        } catch (error) {
          logger.error(`[${flowKey}] Error checking flow state:`, error);
          cleanup();
          reject(error);
        }
      }, checkInterval);

      this.intervals.add(intervalId);
    });
  }

  /**
   * Completes a flow successfully
   */
  async completeFlow(flowId: string, type: string, result: T): Promise<boolean> {
    const flowKey = this.getFlowKey(flowId, type);
    const flowState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;

    if (!flowState) {
      logger.warn(
        `[FlowStateManager] completeFlow: flow not found — key=${flowKey}. ` +
          'Possible causes: flow TTL expired before callback arrived, flow was never created, or ' +
          'the callback is routing to a different instance without shared Keyv storage.',
        { flowId, type },
      );
      return false;
    }

    /** Prevent duplicate completion */
    if (flowState.status === 'COMPLETED') {
      logger.debug(
        '[FlowStateManager] Flow already completed, skipping to prevent duplicate completion',
        {
          flowId,
          type,
        },
      );
      return true;
    }

    const updatedState: FlowState<T> = {
      ...flowState,
      status: 'COMPLETED',
      result,
      completedAt: Date.now(),
    };

    await this.keyv.set(flowKey, updatedState, this.ttl);

    logger.debug('[FlowStateManager] Flow completed successfully', {
      flowId,
      type,
    });

    return true;
  }

  /**
   * Atomically transitions a flow from PENDING to COMPLETED, for callers that
   * need to know whether THEY won a completion race (unlike `completeFlow`,
   * which is last-write-wins and returns true for any caller as long as the
   * flow ends up COMPLETED — the right behavior for OAuth/token flows, but not
   * for e.g. two concurrent submissions of the same URL-mode elicitation).
   *
   * Acquires the store's distributed lock when available (`acquireLock`/
   * `releaseLock` on the underlying Keyv, see `flowsCache`), falling back to
   * an in-process mutex otherwise.
   *
   * @returns true ONLY for the caller that performed the PENDING->COMPLETED
   * transition; false if the flow is missing, already COMPLETED/FAILED, or
   * the caller lost the race to another concurrent caller.
   */
  async completeFlowIfPending(flowId: string, type: string, result: T): Promise<boolean> {
    const flowKey = this.getFlowKey(flowId, type);

    const transition = async (): Promise<boolean> => {
      const flowState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
      if (!flowState || flowState.status !== 'PENDING') {
        return false;
      }

      const updatedState: FlowState<T> = {
        ...flowState,
        status: 'COMPLETED',
        result,
        completedAt: Date.now(),
      };

      await this.keyv.set(flowKey, updatedState, this.ttl);

      logger.debug('[FlowStateManager] Flow completed successfully (atomic)', {
        flowId,
        type,
      });

      return true;
    };

    const lockableStore = this.keyv as LockableKeyv;
    if (lockableStore.acquireLock && lockableStore.releaseLock) {
      const lockKey = `lock:${flowKey}`;
      for (let attempt = 0; attempt < COMPLETE_LOCK_ATTEMPTS; attempt++) {
        const token = await lockableStore.acquireLock(lockKey);
        if (token) {
          try {
            return await transition();
          } finally {
            await lockableStore.releaseLock(lockKey, token);
          }
        }
        /** Losing the lock is not the same as losing the race: the holder may
         *  still be between its read and its write. Returning false here would
         *  have the caller re-read a PENDING state and report a conflict with no
         *  winning action, so the loser's UI shows its own attempted action.
         *  Retry briefly; if the holder settled the flow we observe the terminal
         *  state and report the loss truthfully, and if it died the lock TTL
         *  lets a later attempt take over. */
        const observed = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
        if (!observed || observed.status !== 'PENDING') {
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, COMPLETE_LOCK_RETRY_MS));
      }
      return false;
    }

    return this.withLocalLock(flowKey, transition);
  }

  /**
   * Checks if a flow is stale based on its age and status
   * @param flowId - The flow identifier
   * @param type - The flow type
   * @param staleThresholdMs - Age in milliseconds after which a non-pending flow is considered stale (default: 2 minutes)
   * @returns Object with isStale boolean and age in milliseconds
   */
  async isFlowStale(
    flowId: string,
    type: string,
    staleThresholdMs: number = PENDING_STALE_MS,
  ): Promise<{ isStale: boolean; age: number; status?: string }> {
    const flowKey = this.getFlowKey(flowId, type);
    const flowState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;

    if (!flowState) {
      return { isStale: false, age: 0 };
    }

    if (flowState.status === 'PENDING') {
      return { isStale: false, age: 0, status: flowState.status };
    }

    const completedAt = flowState.completedAt || flowState.failedAt;
    const createdAt = flowState.createdAt;

    let flowAge = 0;
    if (completedAt) {
      flowAge = Date.now() - completedAt;
    } else if (createdAt) {
      flowAge = Date.now() - createdAt;
    }

    return {
      isStale: flowAge > staleThresholdMs,
      age: flowAge,
      status: flowState.status,
    };
  }

  /**
   * Marks a flow as failed
   */
  async failFlow(flowId: string, type: string, error: Error | string): Promise<boolean> {
    const flowKey = this.getFlowKey(flowId, type);
    const flowState = (await this.keyv.get(flowKey)) as FlowState | undefined;

    if (!flowState) {
      return false;
    }

    if (flowState.status === 'COMPLETED') {
      logger.debug(
        '[FlowStateManager] Flow already completed, skipping failure to prevent overwrite',
        {
          flowId,
          type,
        },
      );
      return true;
    }

    const updatedState: FlowState = {
      ...flowState,
      status: 'FAILED',
      error: error instanceof Error ? error.message : error,
      failedAt: Date.now(),
    };

    await this.keyv.set(flowKey, updatedState, this.ttl);
    return true;
  }

  /**
   * Gets current flow state
   */
  async getFlowState(flowId: string, type: string): Promise<StoredDataNoRaw<FlowState<T>> | null> {
    const flowKey = this.getFlowKey(flowId, type);
    return this.keyv.get(flowKey);
  }

  /**
   * Creates a new flow and waits for its completion, only executing the handler if no existing flow is found
   * @param flowId - The ID of the flow
   * @param type - The type of flow
   * @param handler - Async function to execute if no existing flow is found
   * @param signal - Optional AbortSignal to cancel the flow
   */
  async createFlowWithHandler(
    flowId: string,
    type: string,
    handler: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const flowKey = this.getFlowKey(flowId, type);
    let existingState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
    if (existingState && !this.isTokenExpired(existingState)) {
      logger.debug(`[${flowKey}] Flow already exists with valid token`);
      return this.monitorFlow(flowKey, type, signal);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    existingState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
    if (existingState && !this.isTokenExpired(existingState)) {
      logger.debug(`[${flowKey}] Flow exists on 2nd check with valid token`);
      return this.monitorFlow(flowKey, type, signal);
    }

    const initialState: FlowState = {
      type,
      status: 'PENDING',
      metadata: {},
      createdAt: Date.now(),
    };
    logger.debug(`[${flowKey}] Creating initial flow state`);
    await this.keyv.set(flowKey, initialState, this.ttl);

    try {
      const result = await handler();
      await this.completeFlow(flowId, type, result);
      const completedState = (await this.keyv.get(flowKey)) as FlowState<T> | undefined;
      if (completedState?.status === 'COMPLETED' && completedState.result !== undefined) {
        return completedState.result;
      }
      return result;
    } catch (error) {
      await this.failFlow(flowId, type, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Deletes a flow state
   */
  async deleteFlow(flowId: string, type: string): Promise<boolean> {
    const flowKey = this.getFlowKey(flowId, type);
    try {
      await this.keyv.delete(flowKey);
      logger.debug(`[${flowKey}] Flow deleted`);
      return true;
    } catch (error) {
      logger.error(`[${flowKey}] Error deleting flow:`, error);
      return false;
    }
  }
}
