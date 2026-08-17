import type { AgentTriggerDeliveryRecord, AgentTriggerDeliveryStore } from './engine';
import type { AgentTriggerExecutionResult } from './host';
import { AgentTriggerDeliveryDeferredError, createAgentTriggerDeliveryEngine } from './engine';
import { AgentTriggerDispatchError } from './dispatch';
import { AgentTriggerExecutionError } from './host';

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  };
});

const START = new Date('2026-08-17T12:00:00.000Z');

const successResult = (): AgentTriggerExecutionResult => ({
  mode: 'fire',
  status: 'started',
  conversationId: 'conversation-1',
});

function delivery(overrides: Partial<AgentTriggerDeliveryRecord> = {}): AgentTriggerDeliveryRecord {
  return {
    id: 'delivery-row-1',
    user: 'user-1',
    claimToken: 'claim-1',
    deliveryKey: 'trigger_1',
    fingerprint: 'fingerprint-1',
    orderingKey: 'ordering-1',
    laneSequence: 1,
    envelope: { version: 1 },
    status: 'leased',
    attempts: 0,
    availableAt: START,
    createdAt: START,
    leaseBy: 'worker-1',
    leaseUntil: new Date(START.getTime() + 120_000),
    ...overrides,
  };
}

function storeWith(overrides: Partial<AgentTriggerDeliveryStore> = {}): AgentTriggerDeliveryStore {
  return {
    claimNext: jest.fn(async () => delivery()),
    findEarlierUnsettled: jest.fn(async () => null),
    release: jest.fn(async () => true),
    beginAttempt: jest.fn(async () => 1),
    defer: jest.fn(async () => true),
    complete: jest.fn(async () => true),
    retry: jest.fn(async () => true),
    dead: jest.fn(async () => true),
    ...overrides,
  };
}

describe('createAgentTriggerDeliveryEngine', () => {
  it('claims, dispatches, and completes with the per-claim fence', async () => {
    const store = storeWith();
    const dispatch = jest.fn(async () => successResult());
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch, now: () => START, workerId: 'worker-1' },
      { concurrency: 1 },
    );

    await expect(engine.runTick()).resolves.toBe(1);

    expect(dispatch).toHaveBeenCalledWith({ version: 1 }, { signal: expect.any(AbortSignal) });
    expect(store.beginAttempt).toHaveBeenCalledWith({
      id: 'delivery-row-1',
      workerId: 'worker-1',
      claimToken: 'claim-1',
      now: START,
    });
    expect(store.complete).toHaveBeenCalledWith({
      id: 'delivery-row-1',
      workerId: 'worker-1',
      claimToken: 'claim-1',
      attempt: 1,
      result: successResult(),
      settledAt: START,
    });
  });

  it('cancels and drains an in-flight delivery for one user', async () => {
    const store = storeWith();
    let dispatchStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      dispatchStarted = resolve;
    });
    const dispatch = jest.fn(
      async (_envelope: unknown, options?: { signal?: AbortSignal }) =>
        new Promise<AgentTriggerExecutionResult>((_resolve, reject) => {
          dispatchStarted?.();
          options?.signal?.addEventListener(
            'abort',
            () =>
              reject(
                new AgentTriggerExecutionError('cancelled', {
                  mode: 'fire',
                  certainty: 'ambiguous',
                  retryable: true,
                  code: 'ABORTED',
                }),
              ),
            { once: true },
          );
        }),
    );
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch, now: () => START, workerId: 'worker-1' },
      { concurrency: 1, maxAttempts: 1 },
    );

    const tick = engine.runTick();
    await started;
    await engine.cancelUser('user-1');
    await tick;

    expect(store.defer).toHaveBeenCalledWith({
      id: 'delivery-row-1',
      workerId: 'worker-1',
      claimToken: 'claim-1',
      attempt: 1,
      availableAt: new Date(START.getTime() + 5_000),
    });
    expect(store.retry).not.toHaveBeenCalled();
    expect(store.dead).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('releases a claimed delivery without dispatch after its user is fenced', async () => {
    const store = storeWith();
    const dispatch = jest.fn(async () => successResult());
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch, now: () => START, workerId: 'worker-1' },
      { concurrency: 1 },
    );

    await engine.cancelUser('user-1');
    await expect(engine.runTick()).resolves.toBe(1);

    expect(store.release).toHaveBeenCalledWith({
      id: 'delivery-row-1',
      workerId: 'worker-1',
      claimToken: 'claim-1',
      availableAt: START,
    });
    expect(store.beginAttempt).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();

    engine.releaseUserCancellation('user-1');
    await engine.runTick();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After for a retryable admission rejection', async () => {
    const store = storeWith();
    const error = new AgentTriggerExecutionError('busy', {
      mode: 'fire',
      certainty: 'definite',
      retryable: true,
      code: 'RATE_LIMITED',
      status: 429,
      retryAfter: '120',
    });
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch: async () => Promise.reject(error), now: () => START },
      { concurrency: 1 },
    );

    await engine.runTick();

    expect(store.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: 'claim-1',
        availableAt: new Date(START.getTime() + 120_000),
        error: expect.objectContaining({
          code: 'RATE_LIMITED',
          certainty: 'definite',
          retryable: true,
          status: 429,
        }),
      }),
    );
    expect(store.dead).not.toHaveBeenCalled();
  });

  it('defers a fenced principal without consuming its delivery attempt', async () => {
    const store = storeWith();
    const engine = createAgentTriggerDeliveryEngine(
      {
        store,
        dispatch: async () =>
          Promise.reject(new AgentTriggerDeliveryDeferredError('principal fenced')),
        now: () => START,
        workerId: 'worker-1',
      },
      { concurrency: 1 },
    );

    await engine.runTick();

    expect(store.defer).toHaveBeenCalledWith({
      id: 'delivery-row-1',
      workerId: 'worker-1',
      claimToken: 'claim-1',
      attempt: 1,
      availableAt: new Date(START.getTime() + 5_000),
    });
    expect(store.retry).not.toHaveBeenCalled();
    expect(store.dead).not.toHaveBeenCalled();
  });

  it('defers a cross-replica account-deletion rejection without consuming its attempt', async () => {
    const store = storeWith();
    const engine = createAgentTriggerDeliveryEngine(
      {
        store,
        dispatch: async () =>
          Promise.reject(
            new AgentTriggerExecutionError('account deletion is in progress', {
              mode: 'fire',
              certainty: 'definite',
              retryable: false,
              code: 'ACCOUNT_DELETION_IN_PROGRESS',
              status: 409,
            }),
          ),
        now: () => START,
        workerId: 'worker-1',
      },
      { concurrency: 1, maxAttempts: 1 },
    );

    await engine.runTick();

    expect(store.defer).toHaveBeenCalledWith({
      id: 'delivery-row-1',
      workerId: 'worker-1',
      claimToken: 'claim-1',
      attempt: 1,
      availableAt: new Date(START.getTime() + 5_000),
    });
    expect(store.retry).not.toHaveBeenCalled();
    expect(store.dead).not.toHaveBeenCalled();
  });

  it('defers an auth-stage account-deletion rejection without consuming its attempt', async () => {
    const store = storeWith();
    const engine = createAgentTriggerDeliveryEngine(
      {
        store,
        dispatch: async () =>
          Promise.reject(
            new AgentTriggerExecutionError('account deletion is in progress', {
              mode: 'fire',
              certainty: 'definite',
              retryable: false,
              code: 'ACCOUNT_DELETION_IN_PROGRESS',
              status: 401,
            }),
          ),
        now: () => START,
        workerId: 'worker-1',
      },
      { concurrency: 1, maxAttempts: 1 },
    );

    await engine.runTick();

    expect(store.defer).toHaveBeenCalledWith({
      id: 'delivery-row-1',
      workerId: 'worker-1',
      claimToken: 'claim-1',
      attempt: 1,
      availableAt: new Date(START.getTime() + 5_000),
    });
    expect(store.retry).not.toHaveBeenCalled();
    expect(store.dead).not.toHaveBeenCalled();
  });

  it('does not shorten Retry-After to the exponential backoff cap', async () => {
    const store = storeWith();
    const error = new AgentTriggerExecutionError('maintenance', {
      mode: 'fire',
      certainty: 'definite',
      retryable: true,
      retryAfter: '3600',
    });
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch: async () => Promise.reject(error), now: () => START },
      { concurrency: 1, retryCapMs: 1_000 },
    );

    await engine.runTick();

    expect(store.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        availableAt: new Date(START.getTime() + 60 * 60_000),
      }),
    );
  });

  it('dead-letters invalid envelopes without retrying', async () => {
    const store = storeWith();
    const engine = createAgentTriggerDeliveryEngine(
      {
        store,
        dispatch: async () => Promise.reject(new AgentTriggerDispatchError('invalid envelope')),
        now: () => START,
      },
      { concurrency: 1 },
    );

    await engine.runTick();

    expect(store.dead).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: 'claim-1',
        error: expect.objectContaining({
          code: 'INVALID_ENVELOPE',
          certainty: 'definite',
          retryable: false,
        }),
      }),
    );
    expect(store.retry).not.toHaveBeenCalled();
  });

  it('dead-letters an exhausted row without dispatching again', async () => {
    const store = storeWith({
      claimNext: jest.fn(async () => delivery({ attempts: 8 })),
    });
    const dispatch = jest.fn(async () => successResult());
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch, now: () => START },
      { concurrency: 1, maxAttempts: 8 },
    );

    await engine.runTick();

    expect(dispatch).not.toHaveBeenCalled();
    expect(store.beginAttempt).not.toHaveBeenCalled();
    expect(store.dead).toHaveBeenCalledWith(expect.objectContaining({ claimToken: 'claim-1' }));
  });

  it('rechecks a leased predecessor promptly instead of waiting for its full lease', async () => {
    const store = storeWith({
      findEarlierUnsettled: jest.fn(async () => ({
        availableAt: new Date(START.getTime() + 2_000),
        leaseUntil: new Date(START.getTime() + 4_000),
      })),
    });
    const dispatch = jest.fn(async () => successResult());
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch, now: () => START },
      { concurrency: 1 },
    );

    await engine.runTick();

    expect(store.release).toHaveBeenCalledWith({
      id: 'delivery-row-1',
      workerId: expect.any(String),
      claimToken: 'claim-1',
      availableAt: new Date(START.getTime() + 250),
    });
    expect(store.beginAttempt).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not poll ahead of a pending predecessor eligibility time', async () => {
    const store = storeWith({
      findEarlierUnsettled: jest.fn(async () => ({
        availableAt: new Date(START.getTime() + 4_000),
      })),
    });
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch: async () => successResult(), now: () => START },
      { concurrency: 1 },
    );

    await engine.runTick();

    expect(store.release).toHaveBeenCalledWith(
      expect.objectContaining({ availableAt: new Date(START.getTime() + 4_000) }),
    );
  });

  it('starts independent deliveries up to the configured concurrency', async () => {
    let releaseDispatch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseDispatch = resolve;
    });
    let dispatchStarts = 0;
    let bothStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      bothStarted = resolve;
    });
    const records = [delivery(), delivery({ id: 'delivery-row-2', claimToken: 'claim-2' })];
    const store = storeWith({
      claimNext: jest.fn(async () => records.shift() ?? null),
    });
    const dispatch = jest.fn(async () => {
      dispatchStarts += 1;
      if (dispatchStarts === 2) {
        bothStarted?.();
      }
      await gate;
      return successResult();
    });
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch, now: () => START },
      { concurrency: 2 },
    );

    const tick = engine.runTick();
    await started;
    expect(dispatch).toHaveBeenCalledTimes(2);
    releaseDispatch?.();
    await tick;
  });

  it('coalesces overlapping ticks into one claim pass', async () => {
    let releaseClaim: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseClaim = resolve;
    });
    const claimNext = jest.fn(async () => {
      await gate;
      return null;
    });
    const store = storeWith({ claimNext });
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch: async () => successResult() },
      { concurrency: 1 },
    );

    const first = engine.runTick();
    const second = engine.runTick();
    releaseClaim?.();
    await Promise.all([first, second]);
    expect(claimNext).toHaveBeenCalledTimes(1);
  });

  it('uses one claim when an idle worker has no due work', async () => {
    const claimNext = jest.fn(async () => null);
    const engine = createAgentTriggerDeliveryEngine(
      { store: storeWith({ claimNext }), dispatch: async () => successResult() },
      { concurrency: 4 },
    );

    await expect(engine.runTick()).resolves.toBe(0);

    expect(claimNext).toHaveBeenCalledTimes(1);
  });

  it('fills an open worker slot while an earlier independent delivery is still running', async () => {
    const records = [delivery({ envelope: { delivery: 1 } })];
    const store = storeWith({
      claimNext: jest.fn(async () => records.shift() ?? null),
    });
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let releaseSecond: (() => void) | undefined;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let firstStarted: (() => void) | undefined;
    const firstStart = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    let secondStarted: (() => void) | undefined;
    const secondStart = new Promise<void>((resolve) => {
      secondStarted = resolve;
    });
    const dispatch = jest.fn(async (value: unknown) => {
      const deliveryNumber = (value as { delivery: number }).delivery;
      if (deliveryNumber === 1) {
        firstStarted?.();
        await firstGate;
      } else {
        secondStarted?.();
        await secondGate;
      }
      return successResult();
    });
    const engine = createAgentTriggerDeliveryEngine({ store, dispatch }, { concurrency: 2 });

    engine.start();
    await firstStart;
    records.push(
      delivery({ id: 'delivery-row-2', claimToken: 'claim-2', envelope: { delivery: 2 } }),
    );
    engine.wake();
    await secondStart;

    expect(dispatch).toHaveBeenCalledTimes(2);
    releaseFirst?.();
    releaseSecond?.();
    await engine.stop();
  });

  it('retries ambiguously when execution succeeds but result persistence fails', async () => {
    const store = storeWith({
      complete: jest.fn(async () => Promise.reject(new Error('mongo unavailable'))),
    });
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch: async () => successResult(), now: () => START, random: () => 0 },
      { concurrency: 1, retryBaseMs: 1_000 },
    );

    await engine.runTick();

    expect(store.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: 'claim-1',
        availableAt: new Date(START.getTime() + 500),
        error: expect.objectContaining({
          code: 'RESULT_PERSISTENCE_FAILED',
          certainty: 'ambiguous',
          retryable: true,
        }),
      }),
    );
  });

  it('aborts in-flight dispatch during stop and persists a retry', async () => {
    const store = storeWith();
    let dispatchStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      dispatchStarted = resolve;
    });
    const dispatch = jest.fn(
      (
        _envelope: unknown,
        options?: { signal?: AbortSignal },
      ): Promise<AgentTriggerExecutionResult> =>
        new Promise((_, reject) => {
          dispatchStarted?.();
          options?.signal?.addEventListener(
            'abort',
            () =>
              reject(
                new AgentTriggerExecutionError('stopping', {
                  mode: 'fire',
                  certainty: 'definite',
                  retryable: true,
                  code: 'ABORTED',
                }),
              ),
            { once: true },
          );
        }),
    );
    const engine = createAgentTriggerDeliveryEngine(
      { store, dispatch, now: () => START },
      { concurrency: 1 },
    );

    const tick = engine.runTick();
    await started;
    await engine.stop();
    await tick;

    expect(store.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        claimToken: 'claim-1',
        error: expect.objectContaining({ code: 'ABORTED', retryable: true }),
      }),
    );
  });
});
