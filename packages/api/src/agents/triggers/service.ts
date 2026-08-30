import {
  AGENT_TRIGGER_WORKER_CAPABILITY_BACKGROUND_COMPLETION_V1,
  AGENT_TRIGGER_WORKER_CAPABILITY_DETACHED_ACTION_V1,
  AGENT_TRIGGER_WORKER_CAPABILITY_QUEUED_TURN_V1,
  logger,
  runAsSystem,
} from '@librechat/data-schemas';
import type {
  AgentTriggerDeliveryMethods,
  AgentTriggerDeliveryStatusRecord,
} from '@librechat/data-schemas';
import type {
  AgentTriggerDeliveryFailure,
  AgentTriggerDeliveryEngine,
  AgentTriggerDeliveryEngineOptions,
  AgentTriggerDeliveryRecord,
  AgentTriggerDeliveryStore,
} from './engine';
import type {
  AgentTriggerExecutionHost,
  AgentTriggerExecutionHostDeps,
  AgentTriggerExecutionResult,
} from './host';
import type { AgentTriggerEnqueueOptions, PreparedAgentTriggerDelivery } from './delivery';
import type { BoundAddress } from '../../app/origin';
import { AgentTriggerDeliveryDeferredError, createAgentTriggerDeliveryEngine } from './engine';
import { isShutdownInProgress, registerShutdownTask } from '../../app/shutdown';
import { generateAgentTriggerToken } from '../../crypto/jwt';
import { prepareAgentTriggerDelivery } from './delivery';
import { selfOriginFromAddress } from '../../app/origin';
import { createAgentTriggerExecutionHost } from './host';
import { parseAgentTriggerEnvelope } from './envelope';

export const AGENT_TRIGGER_TOKEN_TTL = '60s';
const DEFAULT_USER_DRAIN_TIMEOUT_MS = 35_000;
const DEFAULT_USER_DRAIN_POLL_MS = 100;
const DEFAULT_PURGE_RECOVERY_INTERVAL_MS = 30_000;
const DEFAULT_PURGE_RECOVERY_LIMIT = 25;

export interface AgentTriggerServiceOptions {
  address?: BoundAddress | string | null;
}

export interface AgentTriggerServiceDeps {
  fetch?: AgentTriggerExecutionHostDeps['fetch'];
  getTimezone?: AgentTriggerExecutionHostDeps['getTimezone'];
  prepareContinue?: AgentTriggerExecutionHostDeps['prepareContinue'];
  mintToken?: AgentTriggerExecutionHostDeps['mintToken'];
  timeoutMs?: number;
  methods?: AgentTriggerDeliveryPersistence;
  deliveryOptions?: AgentTriggerDeliveryEngineOptions;
  isPrincipalActive?: (userId: string) => boolean | Promise<boolean>;
  userDrainTimeoutMs?: number;
  userDrainPollMs?: number;
  purgeRecoveryIntervalMs?: number;
  purgeRecoveryLimit?: number;
  supportsDetachedActionCompletion?: () => boolean;
}

export interface AgentTriggerDeliveryReceipt {
  id: string;
  deliveryKey: string;
  status: Exclude<AgentTriggerStoredRecord['status'], 'batched'>;
  availableAt: Date;
  replayed: boolean;
}

export class AgentTriggerServiceUnavailableError extends AgentTriggerDeliveryDeferredError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentTriggerServiceUnavailableError';
  }
}

export interface AgentTriggerStoredHistoryEntry {
  attempt: number;
  outcome: 'succeeded' | 'retry' | 'dead';
  at: Date;
  workerId: string;
  error?: AgentTriggerDeliveryFailure;
}

export interface AgentTriggerStoredRecord extends Omit<AgentTriggerDeliveryRecord, 'claimToken'> {
  claimToken?: string;
  tenantId?: string;
  result?: unknown;
  history?: AgentTriggerStoredHistoryEntry[];
  settledAt?: Date;
  expiresAt?: Date;
  requeueCount?: number;
}

/** Persistence contract implemented by the data-schemas method bundle. */
export interface AgentTriggerDeliveryPersistence {
  ensureAgentTriggerDeliveryIndexes: () => Promise<void>;
  enqueueAgentTriggerDelivery: (
    input: PreparedAgentTriggerDelivery,
  ) => Promise<{ delivery: AgentTriggerStoredRecord; replayed: boolean }>;
  claimNextAgentTriggerDelivery: (
    input: Parameters<AgentTriggerDeliveryStore['claimNext']>[0] & {
      workerCapabilities?: string[];
    },
  ) => ReturnType<AgentTriggerDeliveryStore['claimNext']>;
  findEarlierAgentTriggerDelivery: AgentTriggerDeliveryStore['findEarlierUnsettled'];
  getAgentTriggerDeliveryBatch: AgentTriggerDeliveryStore['getBatch'];
  releaseAgentTriggerDelivery: AgentTriggerDeliveryStore['release'];
  beginAgentTriggerDeliveryAttempt: AgentTriggerDeliveryStore['beginAttempt'];
  deferAgentTriggerDeliveryAttempt: AgentTriggerDeliveryStore['defer'];
  completeAgentTriggerDelivery: AgentTriggerDeliveryStore['complete'];
  retireAgentTriggerDelivery: AgentTriggerDeliveryMethods['retireAgentTriggerDelivery'];
  renewAgentTriggerDeliveryProducerLease: AgentTriggerDeliveryMethods['renewAgentTriggerDeliveryProducerLease'];
  retryAgentTriggerDelivery: AgentTriggerDeliveryStore['retry'];
  deadLetterAgentTriggerDelivery: AgentTriggerDeliveryStore['dead'];
  getAgentTriggerDelivery: (deliveryKey: string) => Promise<AgentTriggerStoredRecord | null>;
  getAgentTriggerDeliveryStatus: (
    deliveryKey: string,
    userId: string,
    sourceKeyId: string,
    tenantId?: string,
  ) => Promise<AgentTriggerDeliveryStatusRecord | null>;
  getAgentTriggerDeadLetters: (limit?: number) => Promise<AgentTriggerStoredRecord[]>;
  requeueAgentTriggerDelivery: (
    id: string,
    availableAt: Date,
  ) => Promise<AgentTriggerStoredRecord | null>;
  countActiveAgentTriggerDeliveriesByUser: (userId: string, now: Date) => Promise<number>;
  recoverAgentTriggerLanePublications: (limit?: number) => Promise<number>;
  recoverAgentTriggerBatchReceipts: (limit?: number) => Promise<number>;
  reclaimInactiveAgentTriggerLanes: (limit?: number) => Promise<number>;
  prepareAgentTriggerUserPurge: (
    userId: string,
    fenceStartedAt: Date,
    tenantId?: string,
  ) => Promise<void>;
  cancelAgentTriggerUserPurge: (userId: string, fenceStartedAt: Date) => Promise<boolean>;
  recoverAgentTriggerUserPurges: (limit?: number) => Promise<number>;
  expireLegacyAgentEventActorReceipts?: (now: Date, limit?: number) => Promise<number>;
  deleteAgentTriggerDeliveriesByUser: (userId: string) => Promise<void>;
}

export interface AgentTriggerService {
  initialize: (options?: AgentTriggerServiceOptions) => Promise<void>;
  stop: () => Promise<void>;
  dispatch: (
    envelope: unknown,
    options?: { signal?: AbortSignal },
  ) => Promise<AgentTriggerExecutionResult>;
  enqueue: (
    envelope: unknown,
    options?: AgentTriggerEnqueueOptions,
  ) => Promise<AgentTriggerDeliveryReceipt>;
  getDelivery: (deliveryKey: string) => Promise<AgentTriggerStoredRecord | null>;
  getDeliveryStatus: (
    deliveryKey: string,
    userId: string,
    sourceKeyId: string,
    tenantId?: string,
  ) => Promise<AgentTriggerDeliveryStatusRecord | null>;
  getDeadLetters: (limit?: number) => Promise<AgentTriggerStoredRecord[]>;
  requeue: (id: string, availableAt?: Date) => Promise<AgentTriggerStoredRecord | null>;
  retire: (
    deliveryKey: string,
    sourceId: string,
    reason: string,
    options?: { onlyIfUnclaimed?: boolean; onlyIfDead?: boolean },
  ) => Promise<boolean>;
  renewProducerLease: (deliveryKey: string, sourceId: string, leaseUntil: Date) => Promise<boolean>;
  drainUser: (userId: string) => Promise<void>;
  prepareUserPurge: (userId: string, fenceStartedAt: Date, tenantId?: string) => Promise<void>;
  cancelUserPurge: (userId: string, fenceStartedAt: Date) => Promise<boolean>;
  purgeUser: (userId: string) => Promise<void>;
}

function createDeliveryStore(
  methods: AgentTriggerDeliveryPersistence,
  supportsDetachedActionCompletion: () => boolean,
): AgentTriggerDeliveryStore {
  return {
    claimNext: (input) =>
      methods.claimNextAgentTriggerDelivery({
        ...input,
        workerCapabilities: [
          AGENT_TRIGGER_WORKER_CAPABILITY_BACKGROUND_COMPLETION_V1,
          AGENT_TRIGGER_WORKER_CAPABILITY_QUEUED_TURN_V1,
          ...(supportsDetachedActionCompletion()
            ? [AGENT_TRIGGER_WORKER_CAPABILITY_DETACHED_ACTION_V1]
            : []),
        ],
      }),
    findEarlierUnsettled: methods.findEarlierAgentTriggerDelivery,
    getBatch: methods.getAgentTriggerDeliveryBatch,
    release: methods.releaseAgentTriggerDelivery,
    beginAttempt: methods.beginAgentTriggerDeliveryAttempt,
    defer: methods.deferAgentTriggerDeliveryAttempt,
    complete: methods.completeAgentTriggerDelivery,
    retry: methods.retryAgentTriggerDelivery,
    dead: methods.deadLetterAgentTriggerDelivery,
  };
}

function publicReceiptStatus(
  status: AgentTriggerStoredRecord['status'],
): AgentTriggerDeliveryReceipt['status'] {
  if (status === 'batched' || status === 'capability_pending') {
    return 'pending';
  }
  if (status === 'capability_staging') {
    return 'staging';
  }
  if (status === 'capability_dead') {
    return 'dead';
  }
  return status === 'capability_leased' ? 'leased' : status;
}

function requireDeliveryOrigin(boundOrigin: string | undefined): void {
  const value = process.env.AGENT_TRIGGERS_SELF_URL ?? boundOrigin;
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new AgentTriggerServiceUnavailableError(
      'Durable agent trigger delivery requires a valid listener address or AGENT_TRIGGERS_SELF_URL',
    );
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new AgentTriggerServiceUnavailableError(
      'Durable agent trigger delivery requires an HTTP(S) self URL without credentials',
    );
  }
}

/** Production composition for trusted, in-process trigger producers. */
export function createAgentTriggerService(deps: AgentTriggerServiceDeps = {}): AgentTriggerService {
  const userDrainTimeoutMs = deps.userDrainTimeoutMs ?? DEFAULT_USER_DRAIN_TIMEOUT_MS;
  const userDrainPollMs = deps.userDrainPollMs ?? DEFAULT_USER_DRAIN_POLL_MS;
  const purgeRecoveryIntervalMs =
    deps.purgeRecoveryIntervalMs ?? DEFAULT_PURGE_RECOVERY_INTERVAL_MS;
  const purgeRecoveryLimit = deps.purgeRecoveryLimit ?? DEFAULT_PURGE_RECOVERY_LIMIT;
  const supportsDetachedActionCompletion = deps.supportsDetachedActionCompletion ?? (() => false);
  if (!Number.isSafeInteger(userDrainTimeoutMs) || userDrainTimeoutMs <= 0) {
    throw new TypeError('userDrainTimeoutMs must be a positive integer');
  }
  if (!Number.isSafeInteger(userDrainPollMs) || userDrainPollMs <= 0) {
    throw new TypeError('userDrainPollMs must be a positive integer');
  }
  if (!Number.isSafeInteger(purgeRecoveryIntervalMs) || purgeRecoveryIntervalMs <= 0) {
    throw new TypeError('purgeRecoveryIntervalMs must be a positive integer');
  }
  if (!Number.isSafeInteger(purgeRecoveryLimit) || purgeRecoveryLimit <= 0) {
    throw new TypeError('purgeRecoveryLimit must be a positive integer');
  }
  let boundOrigin: string | undefined;
  let deliveryEngine: AgentTriggerDeliveryEngine | undefined;
  let initializePromise: Promise<void> | undefined;
  let purgeRecoveryPromise: Promise<void> | undefined;
  let purgeRecoveryTimer: NodeJS.Timeout | undefined;
  let deliveryReady = false;
  let stopping = false;
  const isPrincipalActive = deps.isPrincipalActive;
  const host: AgentTriggerExecutionHost = createAgentTriggerExecutionHost({
    getBaseUrl: (options) => {
      const origin =
        options?.localOnly === true
          ? boundOrigin
          : (process.env.AGENT_TRIGGERS_SELF_URL ?? boundOrigin);
      if (origin == null) {
        throw new Error('Agent trigger service has not been initialized with a listener address');
      }
      return origin;
    },
    mintToken:
      deps.mintToken ??
      ((principal) => generateAgentTriggerToken(principal.userId, AGENT_TRIGGER_TOKEN_TTL)),
    ...(deps.fetch != null && { fetch: deps.fetch }),
    ...(deps.getTimezone != null && { getTimezone: deps.getTimezone }),
    ...(deps.prepareContinue != null && {
      prepareContinue: deps.prepareContinue,
    }),
    ...(deps.timeoutMs != null && { timeoutMs: deps.timeoutMs }),
  });

  const requireMethods = (): AgentTriggerDeliveryPersistence => {
    if (deps.methods == null || !deliveryReady || isShutdownInProgress()) {
      throw new AgentTriggerServiceUnavailableError(
        'Durable agent trigger delivery is not ready on this server',
      );
    }
    return deps.methods;
  };

  const requireCleanupMethods = (): AgentTriggerDeliveryPersistence => {
    if (deps.methods == null) {
      throw new AgentTriggerServiceUnavailableError(
        'Durable agent trigger delivery is not configured on this server',
      );
    }
    return deps.methods;
  };

  const requireActivePrincipal = async (userId: string): Promise<void> => {
    if (isPrincipalActive != null && !(await runAsSystem(async () => isPrincipalActive(userId)))) {
      throw new AgentTriggerServiceUnavailableError(
        'Agent trigger delivery principal is no longer active',
      );
    }
  };

  const dispatchForActivePrincipal = async (
    envelope: unknown,
    options?: { signal?: AbortSignal },
  ): Promise<AgentTriggerExecutionResult> => {
    const parsed = parseAgentTriggerEnvelope(envelope);
    await requireActivePrincipal(parsed.principal.userId);
    return host.dispatch(parsed, options);
  };

  const drainUser = async (userId: string): Promise<void> => {
    const methods = requireMethods();
    await deliveryEngine?.cancelUser(userId);

    try {
      const deadline = Date.now() + userDrainTimeoutMs;
      while (
        (await runAsSystem(async () =>
          methods.countActiveAgentTriggerDeliveriesByUser(userId, new Date()),
        )) > 0
      ) {
        if (Date.now() >= deadline) {
          throw new AgentTriggerServiceUnavailableError(
            `Timed out draining active agent trigger deliveries for user ${userId}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, userDrainPollMs));
      }
    } finally {
      deliveryEngine?.releaseUserCancellation(userId);
    }
  };

  const recoverPurges = (): Promise<void> => {
    if (deps.methods == null || stopping) {
      return Promise.resolve();
    }
    if (purgeRecoveryPromise != null) {
      return purgeRecoveryPromise;
    }
    const methods = deps.methods;
    const current = runAsSystem(async () => {
      const [purgedUsers, publishedLanes, recoveredBatches, expiredLegacyActorReceipts] =
        await Promise.all([
          methods.recoverAgentTriggerUserPurges(purgeRecoveryLimit),
          methods.recoverAgentTriggerLanePublications(purgeRecoveryLimit),
          methods.recoverAgentTriggerBatchReceipts(purgeRecoveryLimit),
          methods.expireLegacyAgentEventActorReceipts?.(new Date(), purgeRecoveryLimit) ??
            Promise.resolve(0),
        ]);
      const reclaimedLanes = await methods.reclaimInactiveAgentTriggerLanes(purgeRecoveryLimit);
      if (publishedLanes > 0) {
        deliveryEngine?.wake();
      }
      if (
        purgedUsers > 0 ||
        publishedLanes > 0 ||
        recoveredBatches > 0 ||
        reclaimedLanes > 0 ||
        expiredLegacyActorReceipts > 0
      ) {
        logger.info('[agent-triggers] recovered durable delivery maintenance', {
          purgedUsers,
          publishedLanes,
          recoveredBatches,
          reclaimedLanes,
          expiredLegacyActorReceipts,
        });
      }
    })
      .catch((error) => {
        logger.error('[agent-triggers] durable delivery maintenance failed:', error);
      })
      .finally(() => {
        if (purgeRecoveryPromise === current) {
          purgeRecoveryPromise = undefined;
        }
      });
    purgeRecoveryPromise = current;
    return current;
  };

  const startPurgeRecovery = (): void => {
    if (purgeRecoveryTimer != null) {
      return;
    }
    void recoverPurges();
    purgeRecoveryTimer = setInterval(() => void recoverPurges(), purgeRecoveryIntervalMs);
    purgeRecoveryTimer.unref();
  };

  const stop = async (): Promise<void> => {
    stopping = true;
    deliveryReady = false;
    if (purgeRecoveryTimer != null) {
      clearInterval(purgeRecoveryTimer);
      purgeRecoveryTimer = undefined;
    }
    await initializePromise?.catch(() => undefined);
    await deliveryEngine?.stop();
    await purgeRecoveryPromise?.catch(() => undefined);
  };

  if (deps.methods != null) {
    registerShutdownTask('agent trigger delivery engine', stop, {
      phase: 'pre-drain',
      priority: 100,
    });
  }

  return {
    initialize: (options = {}) => {
      boundOrigin = selfOriginFromAddress(options.address) ?? boundOrigin;
      if (deps.methods == null || deliveryReady) {
        return Promise.resolve();
      }
      if (initializePromise != null) {
        return initializePromise;
      }
      if (stopping || isShutdownInProgress()) {
        return Promise.reject(
          new AgentTriggerServiceUnavailableError(
            'Durable agent trigger delivery cannot start during shutdown',
          ),
        );
      }
      const methods = deps.methods;
      initializePromise = runAsSystem(async () => {
        requireDeliveryOrigin(boundOrigin);
        await methods.ensureAgentTriggerDeliveryIndexes();
        if (stopping || isShutdownInProgress()) {
          throw new AgentTriggerServiceUnavailableError(
            'Durable agent trigger delivery cannot start during shutdown',
          );
        }
        deliveryEngine = createAgentTriggerDeliveryEngine(
          {
            store: createDeliveryStore(methods, supportsDetachedActionCompletion),
            dispatch: dispatchForActivePrincipal,
          },
          deps.deliveryOptions,
        );
        deliveryReady = true;
        deliveryEngine.start();
        startPurgeRecovery();
        logger.info('[agent-triggers] durable delivery engine started');
      }).finally(() => {
        initializePromise = undefined;
      });
      return initializePromise;
    },
    stop,
    dispatch: dispatchForActivePrincipal,
    enqueue: async (envelope, options) => {
      const methods = requireMethods();
      const prepared = prepareAgentTriggerDelivery(envelope, options);
      const awaitTerminalHandling =
        prepared.envelope.mode === 'continue' &&
        prepared.envelope.target.bindingId != null &&
        prepared.envelope.target.sourceKeyId != null;
      const durableDelivery: PreparedAgentTriggerDelivery = {
        ...prepared,
        ...(awaitTerminalHandling && { awaitTerminalHandling: true }),
      };
      await requireActivePrincipal(String(prepared.user));
      const queued = await runAsSystem(async () =>
        methods.enqueueAgentTriggerDelivery(durableDelivery),
      );
      try {
        await requireActivePrincipal(String(prepared.user));
      } catch (error) {
        await drainUser(String(prepared.user));
        throw error;
      }
      const eligibleAt = queued.delivery.availableAt;
      if (eligibleAt instanceof Date && eligibleAt.getTime() > Date.now()) {
        deliveryEngine?.noteEligibleAt(eligibleAt);
      } else {
        deliveryEngine?.wake();
      }
      const effective =
        queued.delivery.status === 'batched'
          ? await runAsSystem(async () =>
              methods.getAgentTriggerDeliveryStatus(
                prepared.deliveryKey,
                prepared.user,
                prepared.envelope.event.source.id,
                prepared.tenantId,
              ),
            )
          : null;
      return {
        id: queued.delivery.id,
        deliveryKey: queued.delivery.deliveryKey,
        status: publicReceiptStatus(effective?.status ?? queued.delivery.status),
        availableAt: effective?.availableAt ?? queued.delivery.availableAt,
        replayed: queued.replayed,
      };
    },
    getDelivery: (deliveryKey) =>
      runAsSystem(async () => requireMethods().getAgentTriggerDelivery(deliveryKey)),
    getDeliveryStatus: (deliveryKey, userId, sourceKeyId, tenantId) =>
      runAsSystem(async () =>
        requireMethods().getAgentTriggerDeliveryStatus(deliveryKey, userId, sourceKeyId, tenantId),
      ),
    getDeadLetters: (limit) =>
      runAsSystem(async () => requireMethods().getAgentTriggerDeadLetters(limit)),
    requeue: (id, availableAt = new Date()) =>
      runAsSystem(async () => {
        const revived = await requireMethods().requeueAgentTriggerDelivery(id, availableAt);
        if (revived != null) {
          if (availableAt.getTime() > Date.now()) {
            deliveryEngine?.noteEligibleAt(availableAt);
          } else {
            deliveryEngine?.wake();
          }
        }
        return revived;
      }),
    retire: (deliveryKey, sourceId, reason, options) =>
      runAsSystem(async () => {
        const retired = await requireCleanupMethods().retireAgentTriggerDelivery({
          deliveryKey,
          sourceId,
          reason,
          settledAt: new Date(),
          ...(options?.onlyIfUnclaimed === true ? { onlyIfUnclaimed: true } : {}),
          ...(options?.onlyIfDead === true ? { onlyIfDead: true } : {}),
        });
        if (retired) {
          deliveryEngine?.wake();
        }
        return retired;
      }),
    renewProducerLease: (deliveryKey, sourceId, leaseUntil) =>
      runAsSystem(async () =>
        requireMethods().renewAgentTriggerDeliveryProducerLease({
          deliveryKey,
          sourceId,
          leaseUntil,
        }),
      ),
    drainUser,
    prepareUserPurge: (userId, fenceStartedAt, tenantId) =>
      runAsSystem(async () =>
        requireCleanupMethods().prepareAgentTriggerUserPurge(userId, fenceStartedAt, tenantId),
      ),
    cancelUserPurge: (userId, fenceStartedAt) =>
      runAsSystem(async () =>
        requireCleanupMethods().cancelAgentTriggerUserPurge(userId, fenceStartedAt),
      ),
    // Account deletion may reach this post-commit cleanup after graceful
    // shutdown has begun. Persistence remains usable even though admissions
    // and the delivery engine are deliberately no longer ready.
    purgeUser: (userId) =>
      runAsSystem(async () => requireCleanupMethods().deleteAgentTriggerDeliveriesByUser(userId)),
  };
}
