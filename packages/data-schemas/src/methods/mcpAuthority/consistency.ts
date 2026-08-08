import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import type { Collection, Document } from 'mongodb';

const GLOBAL_FENCE_ID = 'global';
const DEFAULT_MUTATION_WAIT_TIMEOUT_MS = 30_000;
const DEFAULT_MUTATION_RETRY_DELAY_MS = 25;
const consistencyModules = new WeakMap<object, MCPAuthorityConsistencyModule>();

export type MCPAuthorityConsistencyFailureReason =
  | 'dirty'
  | 'generation_exhausted'
  | 'generation_changed'
  | 'invalid_clock'
  | 'invalid_generation'
  | 'invalid_options'
  | 'invalid_owner'
  | 'malformed_fence'
  | 'mutation_failed'
  | 'uninitialized';

export class MCPAuthorityConsistencyError extends Error {
  constructor(
    public readonly reason: MCPAuthorityConsistencyFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'MCPAuthorityConsistencyError';
  }
}

export interface MCPAuthorityGeneration {
  readonly generation: number;
}

export interface MCPAuthorityStableSnapshot<Snapshot> extends MCPAuthorityGeneration {
  readonly snapshot: Snapshot;
}

export interface MCPAuthorityMutationResult<Result> extends MCPAuthorityGeneration {
  readonly result: Result;
}

export interface MCPAuthorityMutationGate {
  mutateMCPAuthority<Result>(
    action: () => Promise<Result>,
  ): Promise<MCPAuthorityMutationResult<Result>>;
}

export interface MCPAuthorityConsistencyModule extends MCPAuthorityMutationGate {
  initialize(): Promise<MCPAuthorityGeneration>;
  readStableSnapshot<Snapshot>(
    read: (generation: number) => Promise<Snapshot>,
  ): Promise<MCPAuthorityStableSnapshot<Snapshot>>;
  assertGeneration(generation: number): Promise<void>;
}

export interface MCPAuthorityConsistencyFence extends Document {
  _id: typeof GLOBAL_FENCE_ID;
  generation: number;
  dirty: boolean;
  ownerId?: string;
  dirtyAt?: Date;
  updatedAt: Date;
}

export interface MCPAuthorityConsistencyOptions {
  collection: Collection<MCPAuthorityConsistencyFence>;
  now: () => Date;
  createOwnerId: () => string;
  mutationWaitTimeoutMs?: number;
  mutationRetryDelayMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
}

export async function runMCPAuthorityMutation<Result>(
  gate: MCPAuthorityMutationGate,
  action: () => Promise<Result>,
): Promise<Result> {
  return (await gate.mutateMCPAuthority(action)).result;
}

export function getMCPAuthorityConsistencyModule(
  mongoose: typeof import('mongoose'),
): MCPAuthorityConsistencyModule {
  const key = mongoose.connection;
  const existing = consistencyModules.get(key);
  if (existing) {
    return existing;
  }
  const consistency = createMCPAuthorityConsistencyModule({
    collection:
      mongoose.connection.collection<MCPAuthorityConsistencyFence>('mcpAuthorityConsistency'),
    now: () => new Date(),
    createOwnerId: randomUUID,
  });
  consistencyModules.set(key, consistency);
  return consistency;
}

interface MCPAuthorityMutationContext {
  readonly marker: object;
  readonly startingGeneration: number;
  active: boolean;
  failed: boolean;
  failure?: unknown;
}

function currentTime(now: () => Date): Date {
  const value = now();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new MCPAuthorityConsistencyError(
      'invalid_clock',
      'MCP authority consistency clock returned an invalid time',
    );
  }
  return new Date(value.getTime());
}

function positiveSafeInteger(value: number | undefined, fallback: number, name: string): number {
  const normalized = value ?? fallback;
  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new MCPAuthorityConsistencyError(
      'invalid_options',
      `MCP authority consistency ${name} must be a positive safe integer`,
    );
  }
  return normalized;
}

function isFence(value: Document | null): value is MCPAuthorityConsistencyFence {
  const hasBaseShape =
    value !== null &&
    value._id === GLOBAL_FENCE_ID &&
    Number.isSafeInteger(value.generation) &&
    value.generation >= 0 &&
    typeof value.dirty === 'boolean' &&
    value.updatedAt instanceof Date &&
    !Number.isNaN(value.updatedAt.getTime());
  if (!hasBaseShape) {
    return false;
  }
  if (!value.dirty) {
    return value.ownerId === undefined && value.dirtyAt === undefined;
  }
  return (
    typeof value.ownerId === 'string' &&
    value.ownerId.length > 0 &&
    value.dirtyAt instanceof Date &&
    !Number.isNaN(value.dirtyAt.getTime())
  );
}

export function createMCPAuthorityConsistencyModule(
  options: MCPAuthorityConsistencyOptions,
): MCPAuthorityConsistencyModule {
  const mutationStorage = new AsyncLocalStorage<MCPAuthorityMutationContext>();
  const mutationMarker: object = Object.freeze({});
  const mutationWaitTimeoutMs = positiveSafeInteger(
    options.mutationWaitTimeoutMs,
    DEFAULT_MUTATION_WAIT_TIMEOUT_MS,
    'mutation wait timeout',
  );
  const mutationRetryDelayMs = positiveSafeInteger(
    options.mutationRetryDelayMs,
    DEFAULT_MUTATION_RETRY_DELAY_MS,
    'mutation retry delay',
  );
  const mutationAcquireAttempts = Math.ceil(mutationWaitTimeoutMs / mutationRetryDelayMs) + 1;
  const wait =
    options.wait ??
    (async (milliseconds: number): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
    });

  function requireFence(fence: Document | null): MCPAuthorityConsistencyFence {
    if (fence === null) {
      throw new MCPAuthorityConsistencyError(
        'uninitialized',
        'MCP authority consistency fence is not initialized',
      );
    }
    if (!isFence(fence)) {
      throw new MCPAuthorityConsistencyError(
        'malformed_fence',
        'MCP authority consistency fence is malformed',
      );
    }
    return fence;
  }

  function requireCleanFence(fence: Document | null): MCPAuthorityConsistencyFence {
    const required = requireFence(fence);
    if (required.dirty) {
      throw new MCPAuthorityConsistencyError('dirty', 'MCP authority consistency fence is dirty');
    }
    return required;
  }

  async function readCleanFence(): Promise<MCPAuthorityConsistencyFence> {
    // eslint-disable-next-line no-restricted-syntax -- the global fence is intentionally a raw Mongo-wire document
    const fence = await options.collection.findOne({ _id: GLOBAL_FENCE_ID });
    return requireCleanFence(fence);
  }

  async function initializeFence(): Promise<MCPAuthorityConsistencyFence> {
    // eslint-disable-next-line no-restricted-syntax -- the global fence is intentionally a raw Mongo-wire document
    const fence = await options.collection.findOneAndUpdate(
      { _id: GLOBAL_FENCE_ID },
      {
        $setOnInsert: {
          generation: 0,
          dirty: false,
          updatedAt: currentTime(options.now),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return requireFence(fence);
  }

  async function initialize(): Promise<MCPAuthorityGeneration> {
    return Object.freeze({ generation: requireCleanFence(await initializeFence()).generation });
  }

  async function readStableSnapshot<Snapshot>(
    read: (generation: number) => Promise<Snapshot>,
  ): Promise<MCPAuthorityStableSnapshot<Snapshot>> {
    const before = await readCleanFence();
    const snapshot = await read(before.generation);
    const after = await readCleanFence();
    if (after.generation !== before.generation) {
      throw new MCPAuthorityConsistencyError(
        'generation_changed',
        'MCP authority generation changed during the snapshot read',
      );
    }
    return Object.freeze({ generation: before.generation, snapshot });
  }

  async function assertGeneration(generation: number): Promise<void> {
    if (!Number.isSafeInteger(generation) || generation < 0) {
      throw new MCPAuthorityConsistencyError(
        'invalid_generation',
        'MCP authority generation is malformed',
      );
    }
    const current = await readCleanFence();
    if (current.generation !== generation) {
      throw new MCPAuthorityConsistencyError(
        'generation_changed',
        'MCP authority generation is no longer current',
      );
    }
  }

  function createOwnerId(): string {
    const ownerId = options.createOwnerId();
    if (typeof ownerId !== 'string' || ownerId.length === 0 || ownerId.length > 256) {
      throw new MCPAuthorityConsistencyError(
        'invalid_owner',
        'MCP authority mutation owner is malformed',
      );
    }
    return ownerId;
  }

  async function mutateMCPAuthority<Result>(
    action: () => Promise<Result>,
  ): Promise<MCPAuthorityMutationResult<Result>> {
    const current = mutationStorage.getStore();
    if (current?.marker === mutationMarker && current.active) {
      try {
        const result = await action();
        return Object.freeze({ generation: current.startingGeneration + 1, result });
      } catch (error) {
        current.failed = true;
        current.failure ??= error;
        throw error;
      }
    }

    await initializeFence();
    const ownerId = createOwnerId();
    const dirtyAt = currentTime(options.now);
    let acquired: MCPAuthorityConsistencyFence | null = null;
    for (let attempt = 0; attempt < mutationAcquireAttempts; attempt++) {
      // eslint-disable-next-line no-restricted-syntax -- the global fence is intentionally a raw Mongo-wire document
      const candidate = await options.collection.findOneAndUpdate(
        {
          _id: GLOBAL_FENCE_ID,
          dirty: false,
          generation: { $lt: Number.MAX_SAFE_INTEGER },
        },
        {
          $set: {
            dirty: true,
            ownerId,
            dirtyAt,
            updatedAt: dirtyAt,
          },
        },
        { returnDocument: 'after' },
      );
      if (candidate !== null) {
        acquired = requireFence(candidate);
        break;
      }
      // eslint-disable-next-line no-restricted-syntax -- the global fence is intentionally a raw Mongo-wire document
      const currentFence = requireFence(await options.collection.findOne({ _id: GLOBAL_FENCE_ID }));
      if (currentFence.generation === Number.MAX_SAFE_INTEGER) {
        throw new MCPAuthorityConsistencyError(
          'generation_exhausted',
          'MCP authority generation is exhausted',
        );
      }
      if (attempt === mutationAcquireAttempts - 1) {
        throw new MCPAuthorityConsistencyError(
          'dirty',
          'MCP authority consistency fence remained dirty while waiting for its owner',
        );
      }
      await wait(mutationRetryDelayMs);
    }
    if (acquired === null) {
      throw new MCPAuthorityConsistencyError(
        'mutation_failed',
        'MCP authority mutation could not acquire the consistency fence',
      );
    }
    if (!isFence(acquired) || !acquired.dirty || acquired.ownerId !== ownerId) {
      throw new MCPAuthorityConsistencyError(
        'malformed_fence',
        'MCP authority mutation acquired a malformed fence',
      );
    }

    const context: MCPAuthorityMutationContext = {
      marker: mutationMarker,
      startingGeneration: acquired.generation,
      active: true,
      failed: false,
    };
    let result: Result;
    try {
      result = await mutationStorage.run(context, action);
      if (context.failed) {
        throw context.failure;
      }
    } catch (error) {
      context.active = false;
      throw error;
    }
    context.active = false;
    const updatedAt = currentTime(options.now);
    // eslint-disable-next-line no-restricted-syntax -- the global fence is intentionally a raw Mongo-wire document
    const published = await options.collection.findOneAndUpdate(
      {
        _id: GLOBAL_FENCE_ID,
        generation: acquired.generation,
        dirty: true,
        ownerId,
      },
      {
        $inc: { generation: 1 },
        $set: { dirty: false, updatedAt },
        $unset: { ownerId: '', dirtyAt: '' },
      },
      { returnDocument: 'after' },
    );
    if (
      published === null ||
      !isFence(published) ||
      published.dirty ||
      published.generation !== acquired.generation + 1
    ) {
      throw new MCPAuthorityConsistencyError(
        'mutation_failed',
        'MCP authority mutation could not publish its generation',
      );
    }
    return Object.freeze({ generation: published.generation, result });
  }

  return Object.freeze({
    initialize,
    readStableSnapshot,
    assertGeneration,
    mutateMCPAuthority,
  });
}
