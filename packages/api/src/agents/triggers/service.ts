import { logger, runAsSystem } from '@librechat/data-schemas';
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
import { isShutdownInProgress, registerShutdownTask } from '../../app/shutdown';
import { generateAgentTriggerToken } from '../../crypto/jwt';
import { createAgentTriggerDeliveryEngine } from './engine';
import { selfOriginFromAddress } from '../../app/origin';
import { prepareAgentTriggerDelivery } from './delivery';
import { createAgentTriggerExecutionHost } from './host';
import { parseAgentTriggerEnvelope } from './envelope';

export const AGENT_TRIGGER_TOKEN_TTL = '60s';
const DEFAULT_USER_DRAIN_TIMEOUT_MS = 35_000;
const DEFAULT_USER_DRAIN_POLL_MS = 100;

export interface AgentTriggerServiceOptions {
  address?: BoundAddress | string | null;
}

export interface AgentTriggerServiceDeps {
  fetch?: AgentTriggerExecutionHostDeps['fetch'];
  getTimezone?: AgentTriggerExecutionHostDeps['getTimezone'];
  mintToken?: AgentTriggerExecutionHostDeps['mintToken'];
  timeoutMs?: number;
  methods?: AgentTriggerDeliveryPersistence;
  deliveryOptions?: AgentTriggerDeliveryEngineOptions;
  isPrincipalActive?: (userId: string) => boolean | Promise<boolean>;
  userDrainTimeoutMs?: number;
  userDrainPollMs?: number;
}

export interface AgentTriggerDeliveryReceipt {
  id: string;
  deliveryKey: string;
  status: AgentTriggerStoredRecord['status'];
  availableAt: Date;
  replayed: boolean;
}

export class AgentTriggerServiceUnavailableError extends Error {
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
  claimNextAgentTriggerDelivery: AgentTriggerDeliveryStore['claimNext'];
  findEarlierAgentTriggerDelivery: AgentTriggerDeliveryStore['findEarlierUnsettled'];
  releaseAgentTriggerDelivery: AgentTriggerDeliveryStore['release'];
  beginAgentTriggerDeliveryAttempt: AgentTriggerDeliveryStore['beginAttempt'];
  completeAgentTriggerDelivery: AgentTriggerDeliveryStore['complete'];
  retryAgentTriggerDelivery: AgentTriggerDeliveryStore['retry'];
  deadLetterAgentTriggerDelivery: AgentTriggerDeliveryStore['dead'];
  getAgentTriggerDelivery: (deliveryKey: string) => Promise<AgentTriggerStoredRecord | null>;
  getAgentTriggerDeadLetters: (limit?: number) => Promise<AgentTriggerStoredRecord[]>;
  requeueAgentTriggerDelivery: (
    id: string,
    availableAt: Date,
  ) => Promise<AgentTriggerStoredRecord | null>;
  countActiveAgentTriggerDeliveriesByUser: (userId: string, now: Date) => Promise<number>;
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
  getDeadLetters: (limit?: number) => Promise<AgentTriggerStoredRecord[]>;
  requeue: (id: string, availableAt?: Date) => Promise<AgentTriggerStoredRecord | null>;
  drainUser: (userId: string) => Promise<void>;
  purgeUser: (userId: string) => Promise<void>;
}

function createDeliveryStore(methods: AgentTriggerDeliveryPersistence): AgentTriggerDeliveryStore {
  return {
    claimNext: methods.claimNextAgentTriggerDelivery,
    findEarlierUnsettled: methods.findEarlierAgentTriggerDelivery,
    release: methods.releaseAgentTriggerDelivery,
    beginAttempt: methods.beginAgentTriggerDeliveryAttempt,
    complete: methods.completeAgentTriggerDelivery,
    retry: methods.retryAgentTriggerDelivery,
    dead: methods.deadLetterAgentTriggerDelivery,
  };
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
  if (!Number.isSafeInteger(userDrainTimeoutMs) || userDrainTimeoutMs <= 0) {
    throw new TypeError('userDrainTimeoutMs must be a positive integer');
  }
  if (!Number.isSafeInteger(userDrainPollMs) || userDrainPollMs <= 0) {
    throw new TypeError('userDrainPollMs must be a positive integer');
  }
  let boundOrigin: string | undefined;
  let deliveryEngine: AgentTriggerDeliveryEngine | undefined;
  let initializePromise: Promise<void> | undefined;
  let deliveryReady = false;
  let stopping = false;
  const isPrincipalActive = deps.isPrincipalActive;
  const host: AgentTriggerExecutionHost = createAgentTriggerExecutionHost({
    getBaseUrl: () => {
      const origin = process.env.AGENT_TRIGGERS_SELF_URL ?? boundOrigin;
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

  const stop = async (): Promise<void> => {
    stopping = true;
    deliveryReady = false;
    await initializePromise?.catch(() => undefined);
    await deliveryEngine?.stop();
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
            store: createDeliveryStore(methods),
            dispatch: dispatchForActivePrincipal,
          },
          deps.deliveryOptions,
        );
        deliveryReady = true;
        deliveryEngine.start();
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
      await requireActivePrincipal(String(prepared.user));
      const queued = await runAsSystem(async () => methods.enqueueAgentTriggerDelivery(prepared));
      try {
        await requireActivePrincipal(String(prepared.user));
      } catch (error) {
        await drainUser(String(prepared.user));
        throw error;
      }
      deliveryEngine?.wake();
      return {
        id: queued.delivery.id,
        deliveryKey: queued.delivery.deliveryKey,
        status: queued.delivery.status,
        availableAt: queued.delivery.availableAt,
        replayed: queued.replayed,
      };
    },
    getDelivery: (deliveryKey) =>
      runAsSystem(async () => requireMethods().getAgentTriggerDelivery(deliveryKey)),
    getDeadLetters: (limit) =>
      runAsSystem(async () => requireMethods().getAgentTriggerDeadLetters(limit)),
    requeue: (id, availableAt = new Date()) =>
      runAsSystem(async () => requireMethods().requeueAgentTriggerDelivery(id, availableAt)),
    drainUser,
    // Account deletion may reach this post-commit cleanup after graceful
    // shutdown has begun. Persistence remains usable even though admissions
    // and the delivery engine are deliberately no longer ready.
    purgeUser: (userId) =>
      runAsSystem(async () => requireCleanupMethods().deleteAgentTriggerDeliveriesByUser(userId)),
  };
}
