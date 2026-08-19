import { randomUUID } from 'node:crypto';
import { logger, runAsSystem } from '@librechat/data-schemas';
import type { AgentTriggerExecutionResult } from './host';
import { AgentTriggerDispatchError } from './dispatch';
import { AgentTriggerExecutionError } from './host';

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LEASE_MS = 2 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_RETRY_CAP_MS = 5 * 60_000;
const DEFAULT_TICK_MS = 1_000;
const ORDERING_RECHECK_MS = 250;
const DEFAULT_DEFER_MS = 5_000;
const MAX_RETRY_AFTER_MS = 24 * 60 * 60_000;

/** A pre-dispatch condition that must not consume the delivery's retry budget. */
export class AgentTriggerDeliveryDeferredError extends Error {
  readonly delayMs: number;

  constructor(message: string, delayMs: number = DEFAULT_DEFER_MS) {
    super(message);
    this.name = 'AgentTriggerDeliveryDeferredError';
    this.delayMs = positiveInteger(delayMs, DEFAULT_DEFER_MS, 'delayMs');
  }
}

export type AgentTriggerDeliveryStatus = 'staging' | 'pending' | 'leased' | 'succeeded' | 'dead';

export interface AgentTriggerDeliveryFailure {
  code: string;
  message: string;
  certainty: 'definite' | 'ambiguous';
  retryable: boolean;
  attemptedAt: Date;
  status?: number;
}

export interface AgentTriggerDeliveryRecord {
  id: string;
  user: string;
  claimToken: string;
  deliveryKey: string;
  fingerprint: string;
  orderingKey: string;
  laneSequence: number;
  envelope: unknown;
  status: AgentTriggerDeliveryStatus;
  attempts: number;
  availableAt: Date;
  createdAt: Date;
  leaseBy?: string;
  leaseUntil?: Date;
  lastError?: AgentTriggerDeliveryFailure;
}

export interface AgentTriggerOrderingBlock {
  availableAt: Date;
  leaseUntil?: Date;
}

export interface AgentTriggerDeliveryStore {
  claimNext: (input: {
    workerId: string;
    claimToken: string;
    now: Date;
    leaseUntil: Date;
  }) => Promise<AgentTriggerDeliveryRecord | null>;
  findEarlierUnsettled: (
    delivery: AgentTriggerDeliveryRecord,
  ) => Promise<AgentTriggerOrderingBlock | null>;
  release: (input: {
    id: string;
    workerId: string;
    claimToken: string;
    availableAt: Date;
  }) => Promise<boolean>;
  beginAttempt: (input: {
    id: string;
    workerId: string;
    claimToken: string;
    now: Date;
  }) => Promise<number | null>;
  defer: (input: {
    id: string;
    workerId: string;
    claimToken: string;
    attempt: number;
    availableAt: Date;
  }) => Promise<boolean>;
  complete: (input: {
    id: string;
    workerId: string;
    claimToken: string;
    attempt: number;
    result: AgentTriggerExecutionResult;
    settledAt: Date;
  }) => Promise<boolean>;
  retry: (input: {
    id: string;
    workerId: string;
    claimToken: string;
    attempt: number;
    error: AgentTriggerDeliveryFailure;
    availableAt: Date;
  }) => Promise<boolean>;
  dead: (input: {
    id: string;
    workerId: string;
    claimToken: string;
    attempt: number;
    error: AgentTriggerDeliveryFailure;
    settledAt: Date;
  }) => Promise<boolean>;
}

export interface AgentTriggerDeliveryEngineOptions {
  concurrency?: number;
  leaseMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  retryCapMs?: number;
  tickMs?: number;
}

export interface AgentTriggerDeliveryEngineDeps {
  store: AgentTriggerDeliveryStore;
  dispatch: (
    envelope: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<AgentTriggerExecutionResult>;
  now?: () => Date;
  random?: () => number;
  workerId?: string;
}

export interface AgentTriggerDeliveryEngine {
  start: () => void;
  stop: () => Promise<void>;
  cancelUser: (userId: string) => Promise<void>;
  releaseUserCancellation: (userId: string) => void;
  wake: () => void;
  runTick: () => Promise<number>;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return resolved;
}

function failure(error: unknown, attemptedAt: Date): AgentTriggerDeliveryFailure {
  if (error instanceof AgentTriggerExecutionError) {
    return {
      code: error.code ?? 'DELIVERY_REJECTED',
      message: error.message,
      certainty: error.certainty,
      retryable: error.retryable,
      attemptedAt,
      ...(error.status != null && { status: error.status }),
    };
  }
  if (error instanceof AgentTriggerDispatchError) {
    return {
      code: 'INVALID_ENVELOPE',
      message: error.message,
      certainty: 'definite',
      retryable: false,
      attemptedAt,
    };
  }
  return {
    code: 'DELIVERY_FAILED',
    message: error instanceof Error ? error.message : String(error),
    certainty: 'definite',
    retryable: true,
    attemptedAt,
  };
}

function retryAt(
  error: unknown,
  attempt: number,
  now: Date,
  baseMs: number,
  capMs: number,
  random: () => number,
): Date {
  if (error instanceof AgentTriggerExecutionError && error.retryAfter != null) {
    const seconds = Number(error.retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(now.getTime() + Math.min(seconds * 1_000, MAX_RETRY_AFTER_MS));
    }
    const absolute = Date.parse(error.retryAfter);
    if (Number.isFinite(absolute) && absolute > now.getTime()) {
      return new Date(Math.min(absolute, now.getTime() + MAX_RETRY_AFTER_MS));
    }
  }
  const exponent = Math.min(attempt - 1, 30);
  const delay = Math.min(baseMs * 2 ** exponent, capMs);
  return new Date(now.getTime() + Math.floor(delay / 2 + random() * (delay / 2)));
}

function isAccountDeletionDeferral(error: unknown): boolean {
  return (
    error instanceof AgentTriggerExecutionError &&
    error.code === 'ACCOUNT_DELETION_IN_PROGRESS' &&
    (error.status === 401 || error.status === 409)
  );
}

function isRuntimeReadinessDeferral(error: unknown): boolean {
  return error instanceof AgentTriggerExecutionError && error.deferWithoutAttempt;
}

/** Durable, lease-fenced delivery runner shared by every trusted event source. */
export function createAgentTriggerDeliveryEngine(
  deps: AgentTriggerDeliveryEngineDeps,
  options: AgentTriggerDeliveryEngineOptions = {},
): AgentTriggerDeliveryEngine {
  const concurrency = positiveInteger(options.concurrency, DEFAULT_CONCURRENCY, 'concurrency');
  const leaseMs = positiveInteger(options.leaseMs, DEFAULT_LEASE_MS, 'leaseMs');
  const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, 'maxAttempts');
  const retryBaseMs = positiveInteger(options.retryBaseMs, DEFAULT_RETRY_BASE_MS, 'retryBaseMs');
  const retryCapMs = positiveInteger(options.retryCapMs, DEFAULT_RETRY_CAP_MS, 'retryCapMs');
  const tickMs = positiveInteger(options.tickMs, DEFAULT_TICK_MS, 'tickMs');
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;
  const workerId = deps.workerId ?? `${process.pid}-${randomUUID()}`;
  const controllers = new Map<AbortController, string>();
  const processing = new Set<Promise<void>>();
  const processingByUser = new Map<string, Set<Promise<void>>>();
  const cancelledUsers = new Set<string>();
  let stopped = false;
  let started = false;
  let repumpRequested = false;
  let timer: NodeJS.Timeout | undefined;
  let activeClaim: Promise<{ count: number; processing: Promise<void>[] }> | undefined;

  const processDelivery = async (delivery: AgentTriggerDeliveryRecord): Promise<void> => {
    const userId = String(delivery.user);
    if (cancelledUsers.has(userId)) {
      await deps.store.release({
        id: delivery.id,
        workerId,
        claimToken: delivery.claimToken,
        availableAt: now(),
      });
      return;
    }

    const block = await deps.store.findEarlierUnsettled(delivery);
    if (block != null) {
      const recheckAt = now().getTime() + ORDERING_RECHECK_MS;
      const nextCheck =
        block.leaseUntil == null ? Math.max(recheckAt, block.availableAt.getTime()) : recheckAt;
      await deps.store.release({
        id: delivery.id,
        workerId,
        claimToken: delivery.claimToken,
        availableAt: new Date(nextCheck),
      });
      return;
    }

    if (delivery.attempts >= maxAttempts) {
      const recorded =
        delivery.lastError ??
        failure(new Error('Delivery attempt limit was already exhausted'), now());
      const deadLettered = await deps.store.dead({
        id: delivery.id,
        workerId,
        claimToken: delivery.claimToken,
        attempt: delivery.attempts,
        error: recorded,
        settledAt: now(),
      });
      if (deadLettered) {
        logger.error('[agent-triggers] delivery dead-lettered after exhausting retries', {
          deliveryKey: delivery.deliveryKey,
          attempts: delivery.attempts,
          code: recorded.code,
        });
      }
      return;
    }

    if (stopped) {
      await deps.store.release({
        id: delivery.id,
        workerId,
        claimToken: delivery.claimToken,
        availableAt: now(),
      });
      return;
    }

    if (cancelledUsers.has(userId)) {
      await deps.store.release({
        id: delivery.id,
        workerId,
        claimToken: delivery.claimToken,
        availableAt: now(),
      });
      return;
    }

    const attempt = await deps.store.beginAttempt({
      id: delivery.id,
      workerId,
      claimToken: delivery.claimToken,
      now: now(),
    });
    if (attempt == null) {
      return;
    }

    const controller = new AbortController();
    controllers.set(controller, userId);
    if (stopped || cancelledUsers.has(userId)) {
      controller.abort(new Error('Agent trigger delivery engine is stopping'));
    }
    try {
      let result: AgentTriggerExecutionResult;
      try {
        result = await deps.dispatch(delivery.envelope, { signal: controller.signal });
      } catch (error) {
        const attemptedAt = now();
        const deletionCancelled = controller.signal.aborted && cancelledUsers.has(userId);
        const deletionRejected = isAccountDeletionDeferral(error);
        const runtimeNotReady = isRuntimeReadinessDeferral(error);
        if (
          error instanceof AgentTriggerDeliveryDeferredError ||
          deletionCancelled ||
          deletionRejected ||
          runtimeNotReady
        ) {
          const delayMs =
            error instanceof AgentTriggerDeliveryDeferredError ? error.delayMs : DEFAULT_DEFER_MS;
          const availableAt = new Date(attemptedAt.getTime() + delayMs);
          const deferred = await deps.store.defer({
            id: delivery.id,
            workerId,
            claimToken: delivery.claimToken,
            attempt,
            availableAt,
          });
          if (deferred) {
            let reason = 'pre_dispatch';
            if (deletionCancelled || deletionRejected) {
              reason = 'account_deletion';
            } else if (runtimeNotReady) {
              reason = 'runtime_readiness';
            }
            logger.info('[agent-triggers] delivery deferred without consuming an attempt', {
              deliveryKey: delivery.deliveryKey,
              reason,
              availableAt: availableAt.toISOString(),
            });
          }
          return;
        }
        const recorded = failure(error, attemptedAt);
        if (!recorded.retryable || attempt >= maxAttempts) {
          const deadLettered = await deps.store.dead({
            id: delivery.id,
            workerId,
            claimToken: delivery.claimToken,
            attempt,
            error: recorded,
            settledAt: attemptedAt,
          });
          if (deadLettered) {
            logger.error('[agent-triggers] delivery dead-lettered', {
              deliveryKey: delivery.deliveryKey,
              attempt,
              code: recorded.code,
              certainty: recorded.certainty,
            });
          }
          return;
        }
        const availableAt = retryAt(error, attempt, attemptedAt, retryBaseMs, retryCapMs, random);
        const retrying = await deps.store.retry({
          id: delivery.id,
          workerId,
          claimToken: delivery.claimToken,
          attempt,
          error: recorded,
          availableAt,
        });
        if (retrying) {
          logger.warn('[agent-triggers] delivery scheduled for retry', {
            deliveryKey: delivery.deliveryKey,
            attempt,
            code: recorded.code,
            certainty: recorded.certainty,
            availableAt: availableAt.toISOString(),
          });
        }
        return;
      }

      const settledAt = now();
      try {
        await deps.store.complete({
          id: delivery.id,
          workerId,
          claimToken: delivery.claimToken,
          attempt,
          result,
          settledAt,
        });
      } catch (error) {
        const recorded: AgentTriggerDeliveryFailure = {
          code: 'RESULT_PERSISTENCE_FAILED',
          message: error instanceof Error ? error.message : String(error),
          certainty: 'ambiguous',
          retryable: true,
          attemptedAt: settledAt,
        };
        const availableAt = retryAt(error, attempt, settledAt, retryBaseMs, retryCapMs, random);
        const retrying = await deps.store.retry({
          id: delivery.id,
          workerId,
          claimToken: delivery.claimToken,
          attempt,
          error: recorded,
          availableAt,
        });
        if (retrying) {
          logger.warn(
            '[agent-triggers] accepted delivery result could not be persisted; retrying',
            {
              deliveryKey: delivery.deliveryKey,
              attempt,
              availableAt: availableAt.toISOString(),
            },
          );
        }
      }
    } finally {
      controllers.delete(controller);
    }
  };

  const claimOne = (): Promise<AgentTriggerDeliveryRecord | null> => {
    const claimedAt = now();
    return deps.store.claimNext({
      workerId,
      claimToken: randomUUID(),
      now: claimedAt,
      leaseUntil: new Date(claimedAt.getTime() + leaseMs),
    });
  };

  const runClaimPass = async (): Promise<{ count: number; processing: Promise<void>[] }> => {
    if (stopped) {
      return { count: 0, processing: [] };
    }
    const openSlots = concurrency - processing.size;
    if (openSlots <= 0) {
      return { count: 0, processing: [] };
    }

    const deliveries: AgentTriggerDeliveryRecord[] = [];
    try {
      const first = await claimOne();
      if (first == null) {
        return { count: 0, processing: [] };
      }
      deliveries.push(first);
    } catch (error) {
      logger.error('[agent-triggers] delivery claim failed:', error);
      return { count: 0, processing: [] };
    }

    if (openSlots > 1) {
      const claimed = await Promise.allSettled(
        Array.from({ length: openSlots - 1 }, () => claimOne()),
      );
      for (const result of claimed) {
        if (result.status === 'fulfilled' && result.value != null) {
          deliveries.push(result.value);
        } else if (result.status === 'rejected') {
          logger.error('[agent-triggers] delivery claim failed:', result.reason);
        }
      }
    }

    const batch: Promise<void>[] = [];
    for (const delivery of deliveries) {
      const userId = String(delivery.user);
      const task = runAsSystem(() => processDelivery(delivery)).catch((error) => {
        logger.error('[agent-triggers] delivery processing failed:', error);
      });
      const tracked = task.finally(() => {
        processing.delete(tracked);
        const userProcessing = processingByUser.get(userId);
        userProcessing?.delete(tracked);
        if (userProcessing?.size === 0) {
          processingByUser.delete(userId);
        }
        if (started && !stopped) {
          queueMicrotask(wake);
        }
      });
      processing.add(tracked);
      const userProcessing = processingByUser.get(userId) ?? new Set<Promise<void>>();
      userProcessing.add(tracked);
      processingByUser.set(userId, userProcessing);
      batch.push(tracked);
    }
    return { count: deliveries.length, processing: batch };
  };

  const claimAvailable = (): Promise<{ count: number; processing: Promise<void>[] }> => {
    if (activeClaim != null) {
      return activeClaim;
    }
    activeClaim = runAsSystem(runClaimPass).finally(() => {
      activeClaim = undefined;
      if (repumpRequested && !stopped) {
        repumpRequested = false;
        queueMicrotask(wake);
      }
    });
    return activeClaim;
  };

  const runTick = async (): Promise<number> => {
    const batch = await claimAvailable();
    await Promise.allSettled(batch.processing);
    return batch.count;
  };

  function wake(): void {
    if (stopped) {
      return;
    }
    if (activeClaim != null) {
      repumpRequested = true;
      return;
    }
    void claimAvailable().catch((error) =>
      logger.error('[agent-triggers] delivery claim pass failed:', error),
    );
  }

  const schedule = () => {
    if (stopped) {
      return;
    }
    timer = setTimeout(() => {
      wake();
      schedule();
    }, tickMs);
    timer.unref();
  };

  return {
    start: () => {
      if (started || stopped) {
        return;
      }
      started = true;
      wake();
      schedule();
    },
    stop: async () => {
      stopped = true;
      if (timer != null) {
        clearTimeout(timer);
      }
      for (const controller of controllers.keys()) {
        controller.abort();
      }
      await activeClaim?.catch(() => undefined);
      await Promise.allSettled([...processing]);
    },
    cancelUser: async (userId) => {
      cancelledUsers.add(userId);
      for (const [controller, activeUserId] of controllers) {
        if (activeUserId === userId) {
          controller.abort(new Error('Agent trigger delivery cancelled for account deletion'));
        }
      }
      await activeClaim?.catch(() => undefined);
      const userProcessing = processingByUser.get(userId);
      if (userProcessing != null) {
        await Promise.allSettled([...userProcessing]);
      }
    },
    releaseUserCancellation: (userId) => {
      cancelledUsers.delete(userId);
    },
    wake,
    runTick,
  };
}
