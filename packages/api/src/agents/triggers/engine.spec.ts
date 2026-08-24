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

  it('defers a continuation until its parent generation settles without consuming an attempt', async () => {
    const store = storeWith();
    const engine = createAgentTriggerDeliveryEngine(
      {
        store,
        dispatch: async () =>
          Promise.reject(
            new AgentTriggerExecutionError('parent generation is still running', {
              mode: 'continue',
              certainty: 'definite',
              retryable: true,
              deferWithoutAttempt: true,
              code: 'PARENT_NOT_READY',
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

  it('backs off polling while idle and snaps back on a wake', async () => {
    jest.useFakeTimers();
    try {
      const store = storeWith({ claimNext: jest.fn(async () => null) });
      const dispatch = jest.fn(async () => successResult());
      const engine = createAgentTriggerDeliveryEngine(
        { store, dispatch, now: () => START, workerId: 'worker-1' },
        { concurrency: 1, tickMs: 1_000, maxIdleTickMs: 8_000 },
      );

      engine.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(store.claimNext).toHaveBeenCalledTimes(1);

      /** Idle polls land at +1s, +5s, +13s (doubling, capped at 8s): 3 more claims in 15s, not 15. */
      await jest.advanceTimersByTimeAsync(15_000);
      expect(store.claimNext).toHaveBeenCalledTimes(4);

      /** A wake — an enqueue nudge or a finished delivery — claims immediately and
       *  re-arms the base cadence, so the next idle poll is one second out again. */
      engine.wake();
      await jest.advanceTimersByTimeAsync(0);
      expect(store.claimNext).toHaveBeenCalledTimes(5);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(store.claimNext).toHaveBeenCalledTimes(6);

      await engine.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns to the base cadence after a claimed delivery interrupts an idle stretch', async () => {
    jest.useFakeTimers();
    try {
      const responses: Array<AgentTriggerDeliveryRecord | null> = [
        null,
        null,
        delivery(),
        null,
        null,
      ];
      const store = storeWith({
        claimNext: jest.fn(async () => (responses.length > 0 ? (responses.shift() ?? null) : null)),
      });
      const dispatch = jest.fn(async () => successResult());
      const engine = createAgentTriggerDeliveryEngine(
        { store, dispatch, now: () => START, workerId: 'worker-1' },
        { concurrency: 1, tickMs: 1_000, maxIdleTickMs: 8_000 },
      );

      engine.start();
      /** start (null) -> +1s (null) -> +5s: the third claim finds work. */
      await jest.advanceTimersByTimeAsync(5_000);
      expect(dispatch).toHaveBeenCalledTimes(1);
      const claimsAfterWork = (store.claimNext as jest.Mock).mock.calls.length;

      /** The completed delivery wakes the engine, so polling resumes at one-second steps. */
      await jest.advanceTimersByTimeAsync(1_000);
      expect((store.claimNext as jest.Mock).mock.calls.length).toBeGreaterThan(claimsAfterWork);

      await engine.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps polling at the base cadence while claims are failing', async () => {
    jest.useFakeTimers();
    try {
      const store = storeWith({
        claimNext: jest.fn(async () => {
          throw new Error('mongo unavailable');
        }),
      });
      const dispatch = jest.fn(async () => successResult());
      const engine = createAgentTriggerDeliveryEngine(
        { store, dispatch, now: () => START, workerId: 'worker-1' },
        { concurrency: 1, tickMs: 1_000, maxIdleTickMs: 8_000 },
      );

      engine.start();
      /** A failed claim proves nothing about the queue, so recovery attempts stay
       *  one second apart instead of stretching toward the idle ceiling. */
      await jest.advanceTimersByTimeAsync(10_000);
      expect((store.claimNext as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(10);

      await engine.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('claims a scheduled retry when it becomes eligible instead of waiting out the idle backoff', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
    try {
      let handedFirst = false;
      let handedRetry = false;
      const store = storeWith({
        claimNext: jest.fn(async () => {
          if (!handedFirst) {
            handedFirst = true;
            return delivery();
          }
          if (!handedRetry && Date.now() >= START.getTime() + 20_000) {
            handedRetry = true;
            return delivery({ claimToken: 'claim-2', attempts: 1 });
          }
          return null;
        }),
      });
      const retryable = new AgentTriggerExecutionError('busy', {
        mode: 'fire',
        certainty: 'definite',
        retryable: true,
        code: 'RATE_LIMITED',
        status: 429,
        retryAfter: '20',
      });
      const dispatch = jest
        .fn()
        .mockRejectedValueOnce(retryable)
        .mockImplementation(async () => successResult());
      const engine = createAgentTriggerDeliveryEngine(
        { store, dispatch, now: () => new Date(), workerId: 'worker-1' },
        { concurrency: 1, tickMs: 1_000, maxIdleTickMs: 60_000 },
      );

      engine.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(store.retry).toHaveBeenCalledWith(
        expect.objectContaining({ availableAt: new Date(START.getTime() + 20_000) }),
      );

      /** The idle backoff alone would next poll at +31s; the recorded eligibility
       *  caps the sleep so the retry is claimed on time. */
      await jest.advanceTimersByTimeAsync(21_000);
      expect(dispatch).toHaveBeenCalledTimes(2);

      await engine.stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it('tracks several eligibility deadlines and interrupts a capped idle sleep for a new earliest', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
    try {
      const handed = new Set<string>();
      const pendingAt = new Map<string, number>([
        ['claim-1', 0],
        ['claim-2', 0],
        ['retry-1', START.getTime() + 5_000],
        ['retry-2', START.getTime() + 23_000],
      ]);
      const store = storeWith({
        claimNext: jest.fn(async () => {
          for (const [token, at] of pendingAt) {
            if (!handed.has(token) && Date.now() >= at) {
              handed.add(token);
              return delivery({ claimToken: token });
            }
          }
          return null;
        }),
      });
      const retryable = (retryAfter: string) =>
        new AgentTriggerExecutionError('busy', {
          mode: 'fire',
          certainty: 'definite',
          retryable: true,
          code: 'RATE_LIMITED',
          status: 429,
          retryAfter,
        });
      const dispatch = jest
        .fn()
        .mockRejectedValueOnce(retryable('5'))
        .mockRejectedValueOnce(retryable('23'))
        .mockImplementation(async () => successResult());
      const engine = createAgentTriggerDeliveryEngine(
        { store, dispatch, now: () => new Date(), workerId: 'worker-1' },
        { concurrency: 2, tickMs: 1_000, maxIdleTickMs: 60_000 },
      );

      engine.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(dispatch).toHaveBeenCalledTimes(2);

      /** Both retry deadlines are tracked: the +5s one fires on time, and the +23s one
       *  survives it — a single-slot tracker would discard it and idle to the cap. */
      await jest.advanceTimersByTimeAsync(6_000);
      expect(dispatch).toHaveBeenCalledTimes(3);
      await jest.advanceTimersByTimeAsync(18_000);
      expect(dispatch).toHaveBeenCalledTimes(4);

      /** And a deadline learned while the timer already sleeps toward the idle cap
       *  re-arms it: nothing new until the engine has idled well past base cadence. */
      await jest.advanceTimersByTimeAsync(40_000);
      pendingAt.set('late-arrival', Date.now() + 3_000);
      engine.noteEligibleAt(new Date(Date.now() + 3_000));
      await jest.advanceTimersByTimeAsync(4_000);
      expect(dispatch).toHaveBeenCalledTimes(5);

      await engine.stop();
    } finally {
      jest.useRealTimers();
    }
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
