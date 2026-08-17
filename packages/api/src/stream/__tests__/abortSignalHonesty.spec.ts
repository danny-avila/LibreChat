/**
 * An abort must never report a stop that no generating process received. Two ways it
 * did: the "was it paused?" test read the PRE-race status (a paused job resumed on a
 * peer replica is aborted from `running`, but reported delivered as though there were
 * no generation loop), and the re-signal path awaited a fire-and-forget publish whose
 * rejection is swallowed, so it always answered "published". Both are what the Stop
 * route's retryability and the account-deletion fence key on.
 */

/** Suppress winston Console transport output (survives jest.resetModules) */
jest.spyOn(console, 'log').mockImplementation();

async function makeManagers() {
  const { GenerationJobManagerClass } = await import('../GenerationJobManager');
  const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
  const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
  // ONE store, two managers: the shape of a multi-replica deployment, and the only way
  // to exercise a generation this process does not own.
  const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
  const make = () => {
    const manager = new GenerationJobManagerClass();
    const eventTransport = new InMemoryEventTransport();
    manager.configure({ jobStore, eventTransport, isRedis: false });
    manager.initialize();
    return { manager, eventTransport };
  };
  const owner = make();
  const peer = make();
  return {
    owner: owner.manager,
    peer: peer.manager,
    peerTransport: peer.eventTransport,
    jobStore,
  };
}

function makeAbortFenceTracker() {
  const fences = new Set<string>();
  const fenceKey = (streamId: string, createdAt: number) => `${streamId}@${createdAt}`;
  const retainAbortDelivery = jest.fn(
    async (_userId: string, _tenantId: string | undefined, streamId: string, createdAt: number) => {
      fences.add(fenceKey(streamId, createdAt));
    },
  );
  const clearAbortDelivery = jest.fn(
    async (_userId: string, _tenantId: string | undefined, streamId: string, createdAt: number) => {
      fences.delete(fenceKey(streamId, createdAt));
    },
  );
  return {
    fences,
    fenceKey,
    retainAbortDelivery,
    clearAbortDelivery,
    fallback: {
      renew: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined),
      retainAbortDelivery,
      clearAbortDelivery,
    },
  };
}

describe('abort signal honesty across replicas', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('reports a peer-owned run aborted from running as UNDELIVERED, even when it was observed paused', async () => {
    const { owner, peer, jobStore } = await makeManagers();
    await owner.createJob('conv-1', 'user-1', 'conv-1');
    const live = await jobStore.getJob('conv-1');
    expect(live?.status).toBe('running');

    // The peer's pre-abort read sees `requires_action` (an approval was pending), then a
    // resume wins `requires_action -> running` on the owner before the peer's CAS lands.
    // Only the FIRST read is stale; the retry loop's re-read sees the truth.
    const realGetJob = jobStore.getJob.bind(jobStore);
    let reads = 0;
    jest.spyOn(jobStore, 'getJob').mockImplementation(async (streamId: string) => {
      const job = await realGetJob(streamId);
      if (job == null || streamId !== 'conv-1' || reads++ > 0) {
        return job;
      }
      return { ...job, status: 'requires_action' as const, pendingActionId: 'act-1' };
    });

    const result = await peer.abortJob('conv-1');

    expect(result.success).toBe(true);
    // The CAS actually won from `running`, not from the observed pause.
    expect(result.abortedFromStatus).toBe('running');
    // So delivery is NOT vacuously true: this replica owns no generation, and a paused
    // job's "nothing to signal" exemption does not apply to a resumed one.
    expect(result.signalDelivered).toBe(false);
  });

  it('still reports a genuinely paused abort as delivered', async () => {
    const { owner, peer, jobStore } = await makeManagers();
    await owner.createJob('conv-2', 'user-1', 'conv-2');
    const live = await jobStore.getJob('conv-2');
    await jobStore.transitionStatus('conv-2', {
      from: 'running',
      to: 'requires_action',
      expectCreatedAt: live!.createdAt,
      patch: { pendingActionId: 'act-1' },
    });

    const result = await peer.abortJob('conv-2');

    expect(result.success).toBe(true);
    expect(result.abortedFromStatus).toBe('requires_action');
    // A pause has no generation loop to receive a signal, so this stays vacuously true.
    expect(result.signalDelivered).toBe(true);
  });

  it('reports republication as FAILED when the acknowledged variant finds no owner', async () => {
    const { owner, peer, peerTransport, jobStore } = await makeManagers();
    await owner.createJob('conv-3', 'user-1', 'conv-3');
    await owner.abortJob('conv-3', { preserveForReconcile: true });
    expect((await jobStore.getJob('conv-3'))?.status).toBe('aborted');

    // Mirror the Redis transport: `emitAbort` is void and swallows its publish rejection
    // internally, so awaiting it can only ever resolve. Without escalating to the
    // acknowledged variant, an outage reads as a successful republication.
    const emitAbort = jest.fn((): void => undefined);
    const emitAbortConfirmed = jest.fn(async () => false);
    Object.assign(peerTransport, { emitAbort, emitAbortConfirmed });

    const result = await peer.resignalAbort('conv-3');

    expect(emitAbortConfirmed).toHaveBeenCalledWith('conv-3', expect.any(Number));
    expect(emitAbort).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: false, published: false });
  });

  it('refuses the abort when the pre-CAS finalization marker cannot be registered', async () => {
    const { owner, peer, jobStore } = await makeManagers();
    await owner.createJob('conv-5', 'user-1', 'conv-5');
    jest
      .spyOn(jobStore, 'registerUserFinalization')
      .mockRejectedValue(new Error('marker store down'));

    const result = await peer.abortJob('conv-5');

    // FAIL CLOSED: nothing was aborted, so refusing merely defers — the Stop route
    // answers retryable and the deletion quiesce keeps its fence. Proceeding instead
    // would open the CAS-to-persistence window with no marker covering it.
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('fence_unavailable');
    expect((await jobStore.getJob('conv-5'))?.status).toBe('running');
  });

  it('registers the abort marker before the terminal CAS and clears it after', async () => {
    const { owner, jobStore } = await makeManagers();
    await owner.createJob('conv-6', 'user-1', 'conv-6');
    const createdAt = (await jobStore.getJob('conv-6'))!.createdAt;
    const register = jest.spyOn(jobStore, 'registerUserFinalization');
    const transition = jest.spyOn(jobStore, 'transitionStatusAndDrainSteers');

    const result = await owner.abortJob('conv-6');

    expect(result.success).toBe(true);
    expect(register).toHaveBeenCalledWith(
      'user-1',
      'conv-6',
      undefined,
      createdAt,
      expect.any(String),
    );
    // BEFORE the CAS: registering after it leaves the window uncovered.
    expect(register.mock.invocationCallOrder[0]).toBeLessThan(
      transition.mock.invocationCallOrder[0],
    );
    // An OWNED abort additionally bridges to the deterministic owner-lifecycle lease
    // before tripping the local generation: the abort call's own contender lease is
    // released on return, while the owner lease survives for the generation's catch
    // (its asynchronous persistence) to release.
    expect(register).toHaveBeenCalledWith('user-1', 'conv-6', undefined, createdAt, 'owner');
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);
  });

  it('releases the abort marker when the terminal CAS is lost', async () => {
    const { owner, peer, jobStore } = await makeManagers();
    await owner.createJob('conv-7', 'user-1', 'conv-7');
    const observed = await jobStore.getJob('conv-7');
    // A replacement generation claims the stream before the peer's abort lands.
    // (The replacement handoff itself holds the predecessor's owner lease — that
    // baseline is the replacement path's designed fence, not this abort's.)
    await owner.createJob('conv-7', 'user-1', 'conv-7');
    const baseline = await jobStore.countUserFinalizations('user-1');

    const result = await peer.abortJob('conv-7', { expectedCreatedAt: observed!.createdAt });

    expect(result.success).toBe(false);
    // Nothing will be persisted by this loser: holding ITS marker to the TTL would
    // fence the user's deletion pointlessly. Only the replacement baseline remains.
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(baseline);
  });

  it('RETAINS the abort lease while the stop is undelivered and unpublished', async () => {
    const { owner, peer, peerTransport, jobStore } = await makeManagers();
    await owner.createJob('conv-8', 'user-1', 'conv-8');
    // Peer-owned generation; the acknowledged publication provably fails.
    Object.assign(peerTransport, {
      emitAbort: jest.fn((): void => undefined),
      emitAbortConfirmed: jest.fn(async () => false),
    });

    const result = await peer.abortJob('conv-8');

    expect(result.success).toBe(true);
    expect(result.signalDelivered).toBe(false);
    expect(result.signalPublished).toBe(false);
    // The job is terminal (invisible to active-set scans). This live-process lease
    // complements the durable user-document delivery fence while the remote owner
    // keeps generating.
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);
  });

  it('heartbeats an undelivered Stop past the lease TTL without a client retry', async () => {
    const { owner, peer, peerTransport, jobStore } = await makeManagers();
    await owner.createJob('conv-9', 'user-1', 'conv-9');
    const emitAbortConfirmed = jest.fn(async () => false);
    Object.assign(peerTransport, { emitAbortConfirmed });
    const register = jest.spyOn(jobStore, 'registerUserFinalization');

    jest.useFakeTimers({ now: Date.now() });
    try {
      const result = await peer.abortJob('conv-9');
      expect(result).toMatchObject({
        success: true,
        signalDelivered: false,
        signalPublished: false,
      });
      const stopRenewals = () => register.mock.calls.filter((call) => call[4] === 'stop');
      expect(stopRenewals()).toHaveLength(1);

      // No resignal is issued. The manager that observed failed delivery owns the
      // liveness duty and must refresh the five-minute marker autonomously.
      await jest.advanceTimersByTimeAsync(6 * 60_000);
      expect(stopRenewals().length).toBeGreaterThan(1);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);
      // The heartbeat probes settlement; it does not depend on another publication.
      expect(emitAbortConfirmed).not.toHaveBeenCalled();
    } finally {
      await Promise.allSettled([owner.destroy(), peer.destroy()]);
      jest.useRealTimers();
    }
  });

  it('persists undelivered Stop recovery evidence before the CAS and keeps it through shutdown', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    jest.spyOn(jobStore, 'destroy').mockResolvedValue();
    const owner = new GenerationJobManagerClass();
    owner.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    owner.initialize();
    const generation = await owner.createJob(
      'conv-durable-stop-recovery',
      'user-1',
      'conv-durable-stop-recovery',
    );

    const retainAbortDelivery = jest.fn(async () => undefined);
    const clearAbortDelivery = jest.fn(async () => undefined);
    const peerTransport = Object.assign(new InMemoryEventTransport(), {
      emitAbortConfirmed: jest.fn(async () => false),
    });
    const peer = new GenerationJobManagerClass();
    peer.configure({
      jobStore,
      eventTransport: peerTransport,
      isRedis: true,
      userFinalizationFallback: {
        renew: jest.fn(async () => undefined),
        clear: jest.fn(async () => undefined),
        retainAbortDelivery,
        clearAbortDelivery,
      },
    });
    peer.initialize();
    const transition = jest.spyOn(jobStore, 'transitionStatusAndDrainSteers');

    const result = await peer.abortJob('conv-durable-stop-recovery');

    expect(result).toMatchObject({
      success: true,
      signalDelivered: false,
      signalPublished: false,
    });
    expect(retainAbortDelivery).toHaveBeenCalledWith(
      'user-1',
      undefined,
      'conv-durable-stop-recovery',
      generation.createdAt,
    );
    expect(retainAbortDelivery.mock.invocationCallOrder[0]).toBeLessThan(
      transition.mock.invocationCallOrder[0],
    );
    expect(clearAbortDelivery).not.toHaveBeenCalled();

    await peer.destroy();
    // TTL-backed manager markers may now age out, but the user-document recovery
    // record must survive so the deletion sweep can enumerate and re-signal it.
    expect(clearAbortDelivery).not.toHaveBeenCalled();
    await owner.destroy();
  });

  it('does not let a predecessor owner release clear the current generation Stop fence', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const retainAbortDelivery = jest.fn(async () => undefined);
    const clearAbortDelivery = jest.fn(async () => undefined);
    const fallback = {
      renew: jest.fn(async () => undefined),
      clear: jest.fn(async () => undefined),
      retainAbortDelivery,
      clearAbortDelivery,
    };
    const owner = new GenerationJobManagerClass();
    owner.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    owner.initialize();
    const peerTransport = Object.assign(new InMemoryEventTransport(), {
      emitAbortConfirmed: jest.fn(async () => false),
    });
    const peer = new GenerationJobManagerClass();
    peer.configure({
      jobStore,
      eventTransport: peerTransport,
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    peer.initialize();

    try {
      const predecessor = await owner.createJob(
        'conv-generation-fence',
        'user-1',
        'conv-generation-fence',
      );
      const predecessorAbort = await owner.abortJob('conv-generation-fence');
      expect(predecessorAbort.signalDelivered).toBe(true);

      const current = await owner.createJob(
        'conv-generation-fence',
        'user-1',
        'conv-generation-fence',
      );
      expect(current.createdAt).toBeGreaterThan(predecessor.createdAt);
      const currentAbort = await peer.abortJob('conv-generation-fence');
      expect(currentAbort).toMatchObject({
        success: true,
        signalDelivered: false,
        signalPublished: false,
      });
      expect(retainAbortDelivery).toHaveBeenLastCalledWith(
        'user-1',
        undefined,
        'conv-generation-fence',
        current.createdAt,
      );
      clearAbortDelivery.mockClear();

      // Generation A still has its local owner hold while generation B's failed
      // Stop owns the stream-level durable recovery fence. A's late catch must not
      // clear B's evidence merely because A has a hold for the same stream.
      await owner.releaseOwnerLease(
        'user-1',
        'conv-generation-fence',
        undefined,
        predecessor.createdAt,
      );
      expect(clearAbortDelivery).not.toHaveBeenCalled();
    } finally {
      await Promise.allSettled([peer.destroy(), owner.destroy()]);
    }
  });

  it('does not let generation A successful abort cleanup erase generation B Stop evidence', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const { fences, fenceKey, fallback, clearAbortDelivery } = makeAbortFenceTracker();
    const owner = new GenerationJobManagerClass();
    owner.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    owner.initialize();
    const peer = new GenerationJobManagerClass();
    peer.configure({
      jobStore,
      eventTransport: Object.assign(new InMemoryEventTransport(), {
        emitAbortConfirmed: jest.fn(async () => false),
      }),
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    peer.initialize();

    let releasePredecessorPersistence!: () => void;
    const predecessorPersistence = new Promise<void>((resolve) => {
      releasePredecessorPersistence = resolve;
    });
    let predecessorEnteredPersistence!: () => void;
    const predecessorPersistenceStarted = new Promise<void>((resolve) => {
      predecessorEnteredPersistence = resolve;
    });

    try {
      const predecessor = await owner.createJob(
        'conv-success-cleanup-fence',
        'user-1',
        'conv-success-cleanup-fence',
      );
      const abortingPredecessor = owner.abortJob('conv-success-cleanup-fence', {
        beforePublish: async () => {
          predecessorEnteredPersistence();
          await predecessorPersistence;
        },
      });
      await predecessorPersistenceStarted;

      const current = await owner.createJob(
        'conv-success-cleanup-fence',
        'user-1',
        'conv-success-cleanup-fence',
      );
      expect(current.createdAt).toBeGreaterThan(predecessor.createdAt);
      await expect(peer.abortJob('conv-success-cleanup-fence')).resolves.toMatchObject({
        success: true,
        signalDelivered: false,
        signalPublished: false,
      });
      expect(fences).toContain(fenceKey('conv-success-cleanup-fence', current.createdAt));

      releasePredecessorPersistence();
      await expect(abortingPredecessor).resolves.toMatchObject({ success: true });

      expect(fences).not.toContain(fenceKey('conv-success-cleanup-fence', predecessor.createdAt));
      expect(fences).toContain(fenceKey('conv-success-cleanup-fence', current.createdAt));
      expect(clearAbortDelivery).toHaveBeenCalledWith(
        'user-1',
        undefined,
        'conv-success-cleanup-fence',
        predecessor.createdAt,
      );
    } finally {
      releasePredecessorPersistence();
      await Promise.allSettled([peer.destroy(), owner.destroy()]);
    }
  });

  it('does not let generation A resignal cleanup erase generation B Stop evidence', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const { fences, fenceKey, fallback } = makeAbortFenceTracker();
    const owner = new GenerationJobManagerClass();
    owner.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    owner.initialize();
    const failingPeer = new GenerationJobManagerClass();
    failingPeer.configure({
      jobStore,
      eventTransport: Object.assign(new InMemoryEventTransport(), {
        emitAbortConfirmed: jest.fn(async () => false),
      }),
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    failingPeer.initialize();

    let acknowledgePredecessor!: (acknowledged: boolean) => void;
    const predecessorAcknowledgement = new Promise<boolean>((resolve) => {
      acknowledgePredecessor = resolve;
    });
    let resignalStarted!: () => void;
    const resignalInFlight = new Promise<void>((resolve) => {
      resignalStarted = resolve;
    });
    const resignaler = new GenerationJobManagerClass();
    resignaler.configure({
      jobStore,
      eventTransport: Object.assign(new InMemoryEventTransport(), {
        emitAbort: jest.fn(() => undefined),
        emitAbortConfirmed: jest.fn(async () => {
          resignalStarted();
          return predecessorAcknowledgement;
        }),
      }),
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    resignaler.initialize();

    try {
      const predecessor = await owner.createJob(
        'conv-resignal-cleanup-fence',
        'user-1',
        'conv-resignal-cleanup-fence',
      );
      await expect(failingPeer.abortJob('conv-resignal-cleanup-fence')).resolves.toMatchObject({
        success: true,
        signalDelivered: false,
        signalPublished: false,
      });
      const resignal = resignaler.resignalAbort(
        'conv-resignal-cleanup-fence',
        predecessor.createdAt,
      );
      await resignalInFlight;

      const current = await owner.createJob(
        'conv-resignal-cleanup-fence',
        'user-1',
        'conv-resignal-cleanup-fence',
      );
      expect(current.createdAt).toBeGreaterThan(predecessor.createdAt);
      await expect(failingPeer.abortJob('conv-resignal-cleanup-fence')).resolves.toMatchObject({
        success: true,
        signalDelivered: false,
        signalPublished: false,
      });
      expect(fences).toContain(fenceKey('conv-resignal-cleanup-fence', current.createdAt));

      acknowledgePredecessor(true);
      await expect(resignal).resolves.toEqual({ delivered: false, published: true });

      expect(fences).not.toContain(fenceKey('conv-resignal-cleanup-fence', predecessor.createdAt));
      expect(fences).toContain(fenceKey('conv-resignal-cleanup-fence', current.createdAt));
    } finally {
      acknowledgePredecessor(false);
      await Promise.allSettled([resignaler.destroy(), failingPeer.destroy(), owner.destroy()]);
    }
  });

  it('heartbeats the abort contender while required persistence exceeds the lease TTL', async () => {
    const { owner, jobStore } = await makeManagers();
    await owner.createJob('conv-slow-stop-persistence', 'user-1', 'conv-slow-stop-persistence');
    const register = jest.spyOn(jobStore, 'registerUserFinalization');
    let persistenceStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      persistenceStarted = resolve;
    });
    let finishPersistence!: () => void;
    const persistenceGate = new Promise<void>((resolve) => {
      finishPersistence = resolve;
    });

    jest.useFakeTimers({ now: Date.now() });
    try {
      const aborting = owner.abortJob('conv-slow-stop-persistence', {
        beforePublish: async () => {
          persistenceStarted();
          await persistenceGate;
        },
      });
      await started;
      const contenderLease = register.mock.calls.find(
        (call) => call[4] !== 'owner' && call[4] !== 'stop',
      )?.[4];
      expect(contenderLease).toEqual(expect.any(String));

      await jest.advanceTimersByTimeAsync(6 * 60_000);
      expect(
        register.mock.calls.filter((call) => call[4] === contenderLease).length,
      ).toBeGreaterThan(1);

      finishPersistence();
      await expect(aborting).resolves.toMatchObject({ success: true });
    } finally {
      await owner.destroy();
      jest.useRealTimers();
    }
  });

  it('a losing second Stop releases only its own lease, never the winning one', async () => {
    const { owner, peer, jobStore } = await makeManagers();
    await owner.createJob('conv-10', 'user-1', 'conv-10');
    // The winning abort parks inside its beforePublish persistence.
    let releaseWinner!: () => void;
    const winnerPersisting = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    let winnerEntered!: () => void;
    const winnerEnteredPersistence = new Promise<void>((resolve) => {
      winnerEntered = resolve;
    });
    const winner = owner.abortJob('conv-10', {
      beforePublish: async () => {
        winnerEntered();
        await winnerPersisting;
      },
    });
    await winnerEnteredPersistence;

    // A second Stop RACES the winner: its pre-abort read still sees `running` (the
    // winner's CAS lands in between), so it gets past the terminal pre-check,
    // registers its own lease, and only then loses the CAS. Pre-lease keying, its
    // registration overwrote the winner's field and its cleanup then deleted it.
    const realGetJob = jobStore.getJob.bind(jobStore);
    const staleRunning = { ...(await realGetJob('conv-10'))!, status: 'running' as const };
    const getJobSpy = jest
      .spyOn(jobStore, 'getJob')
      .mockImplementationOnce(async () => staleRunning);
    const loser = await peer.abortJob('conv-10');
    getJobSpy.mockRestore();
    expect(loser.success).toBe(false);

    // The winner's persistence is still live: its lease must have survived the
    // loser's cleanup. Keyed without lease tokens, this read 0.
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBeGreaterThanOrEqual(1);

    releaseWinner();
    await winner;
  });

  it('clears the retained stop lease once a resignal finally leaves', async () => {
    const { owner, peer, peerTransport, jobStore } = await makeManagers();
    await owner.createJob('conv-11', 'user-1', 'conv-11');
    Object.assign(peerTransport, {
      emitAbort: jest.fn((): void => undefined),
      emitAbortConfirmed: jest.fn(async () => false),
    });
    await peer.abortJob('conv-11');
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);
    // A failed resignal renews the fence…
    await peer.resignalAbort('conv-11');
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);

    // …and the first one that leaves reaps it instead of waiting out the TTL.
    Object.assign(peerTransport, { emitAbortConfirmed: jest.fn(async () => true) });
    const resignal = await peer.resignalAbort('conv-11');

    expect(resignal.published).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
  });

  it('retains the predecessor owner lease when a replacement handoff fails', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const owner = new GenerationJobManagerClass();
    owner.configure({ jobStore, eventTransport: new InMemoryEventTransport(), isRedis: false });
    owner.initialize();
    // Redis mode is what requires the durable owner proof for a replacement handoff;
    // this transport provides none, so the acknowledgement provably fails.
    const peer = new GenerationJobManagerClass();
    const peerTransport = new InMemoryEventTransport();
    Object.assign(peerTransport, { emitAbortConfirmed: jest.fn(async () => false) });
    peer.configure({ jobStore, eventTransport: peerTransport, isRedis: true });
    peer.initialize();

    await owner.createJob('conv-12', 'user-1', 'conv-12');
    const predecessor = await jobStore.getJob('conv-12');
    expect(predecessor?.status).toBe('running');

    // The peer replaces the stream: the atomic create removes the predecessor from
    // active storage, but its owner never acknowledges the handoff — the replacement
    // is terminalized and createJob throws. Without the retained lease, a deletion
    // quiesce could discover NEITHER generation while the predecessor's provider may
    // still be generating.
    await expect(peer.createJob('conv-12', 'user-1', 'conv-12')).rejects.toThrow(
      'predecessor handoff',
    );

    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBeGreaterThanOrEqual(1);
  });

  it('heartbeats a held lease past the store TTL until released', async () => {
    const { owner, jobStore } = await makeManagers();
    jest.useFakeTimers({ now: Date.now() });
    try {
      const hold = await owner.holdUserFinalization('user-1', 'conv-13', undefined, 1000, 'held');
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);

      // The store TTL is five minutes and only bounds a crashed holder: live
      // persistence (a stalled save, a long title) must never outlive its fence.
      await jest.advanceTimersByTimeAsync(6 * 60 * 1000);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);

      await hold.release();
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('promotes a stalled primary heartbeat into Mongo before the primary TTL expires', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const fallback = {
      renew: jest.fn(
        async (
          _userId: string,
          _tenantId: string | undefined,
          _leaseKey: string,
          _expiresAt: Date,
        ) => undefined,
      ),
      clear: jest.fn(
        async (_userId: string, _tenantId: string | undefined, _leaseKey: string) => undefined,
      ),
    };
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    manager.initialize();

    jest.useFakeTimers({ now: Date.now() });
    try {
      const hold = await manager.holdUserFinalization(
        'user-1',
        'conv-primary-stall',
        undefined,
        1000,
        'held',
      );
      const realRegister = jobStore.registerUserFinalization.bind(jobStore);
      let releasePrimary!: () => void;
      const primaryPending = new Promise<void>((resolve) => {
        releasePrimary = resolve;
      });
      jest.spyOn(jobStore, 'registerUserFinalization').mockImplementationOnce(async (...args) => {
        await primaryPending;
        await realRegister(...args);
      });

      // The renewal starts at one minute. Five seconds later it is promoted to
      // Mongo, leaving almost four minutes on the last confirmed primary TTL.
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(5_000);
      expect(fallback.renew).toHaveBeenCalledWith(
        'user-1',
        undefined,
        expect.stringMatching(/^fallback_[A-Za-z0-9_-]+$/),
        expect.any(Date),
      );

      // Release serializes behind the late primary command, then clears both
      // stores so that command cannot resurrect a marker behind cleanup.
      const releasing = hold.release();
      releasePrimary();
      await releasing;
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
      const fallbackKey = fallback.renew.mock.calls[0][2];
      expect(fallback.clear).toHaveBeenCalledWith('user-1', undefined, fallbackKey);
      await jest.advanceTimersByTimeAsync(6 * 60_000);
      expect(fallback.renew).toHaveBeenCalledTimes(1);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
    } finally {
      await manager.destroy();
      jest.useRealTimers();
    }
  });

  it('keeps a promoted fallback alive after the primary heartbeat recovers', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const fallback = {
      renew: jest.fn(
        async (
          _userId: string,
          _tenantId: string | undefined,
          _leaseKey: string,
          _expiresAt: Date,
        ) => undefined,
      ),
      clear: jest.fn(
        async (_userId: string, _tenantId: string | undefined, _leaseKey: string) => undefined,
      ),
    };
    const manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore,
      eventTransport: new InMemoryEventTransport(),
      isRedis: true,
      userFinalizationFallback: fallback,
    });
    manager.initialize();

    jest.useFakeTimers({ now: Date.now() });
    try {
      const hold = await manager.holdUserFinalization(
        'user-1',
        'conv-primary-recovers',
        undefined,
        1000,
        'held',
      );
      jest
        .spyOn(jobStore, 'registerUserFinalization')
        .mockRejectedValueOnce(new Error('primary temporarily unavailable'));

      await jest.advanceTimersByTimeAsync(60_000);
      expect(fallback.renew).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(60_000);
      // Primary recovery does not clear the fallback mid-hold. It is renewed
      // until the persistence owner explicitly releases both leases.
      expect(fallback.renew).toHaveBeenCalledTimes(2);

      await hold.release();
      expect(fallback.clear).toHaveBeenCalledTimes(1);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
    } finally {
      await manager.destroy();
      jest.useRealTimers();
    }
  });

  it('retains a fence when the abort transition commits but loses its reply', async () => {
    const { owner, peer, jobStore } = await makeManagers();
    await owner.createJob('conv-14', 'user-1', 'conv-14');
    // The Lua CAS commits, then the reply is lost: the job is aborted (invisible to
    // active-set scans) but no signal was ever sent. Clearing the contender lease on
    // the throw — as if nothing happened — left NOTHING fencing the user.
    const realTransition = jobStore.transitionStatusAndDrainSteers.bind(jobStore);
    jest
      .spyOn(jobStore, 'transitionStatusAndDrainSteers')
      .mockImplementation(async (streamId, args) => {
        await realTransition(streamId, args);
        throw new Error('connection reset before reply');
      });

    await expect(peer.abortJob('conv-14')).rejects.toThrow('connection reset');

    expect((await jobStore.getJob('conv-14'))?.status).toBe('aborted');
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBeGreaterThanOrEqual(1);
  });

  it('clears the contender lease only when the thrown transition provably did not commit', async () => {
    const { owner, peer, jobStore } = await makeManagers();
    await owner.createJob('conv-15', 'user-1', 'conv-15');
    jest
      .spyOn(jobStore, 'transitionStatusAndDrainSteers')
      .mockRejectedValue(new Error('store outage'));

    await expect(peer.abortJob('conv-15')).rejects.toThrow('store outage');

    // The re-read shows the generation still live: the CAS did not commit, so the
    // contender lease releases instead of leaking to its TTL.
    expect((await jobStore.getJob('conv-15'))?.status).toBe('running');
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
  });

  it('hands a LOCAL resignal delivery to the owner lease before clearing the stop lease', async () => {
    const { owner, peer, peerTransport, jobStore } = await makeManagers();
    await owner.createJob('conv-16', 'user-1', 'conv-16');
    Object.assign(peerTransport, {
      emitAbort: jest.fn((): void => undefined),
      emitAbortConfirmed: jest.fn(async () => false),
    });
    await peer.abortJob('conv-16');
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);

    // The OWNER's replica retries the resignal: delivery is local, its catch
    // persistence is still ahead — the stop lease may only clear once the owner
    // lease holds.
    const register = jest.spyOn(jobStore, 'registerUserFinalization');
    const resignal = await owner.resignalAbort('conv-16');

    expect(resignal.delivered).toBe(true);
    expect(register).toHaveBeenCalledWith(
      'user-1',
      'conv-16',
      undefined,
      expect.any(Number),
      'owner',
    );
    await new Promise((resolve) => setImmediate(resolve));
    // Exactly the owner lease remains; the stop lease is reaped.
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);
  });

  it('holds the pre-ACK owner lease past the store TTL until the owner releases it', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const transport = new InMemoryEventTransport();
    const manager = new GenerationJobManagerClass();
    manager.configure({ jobStore, eventTransport: transport, isRedis: false });
    manager.initialize();
    await manager.createJob('conv-17', 'user-1', 'conv-17');
    const createdAt = (await jobStore.getJob('conv-17'))!.createdAt;

    jest.useFakeTimers({ now: Date.now() });
    try {
      // The abort callback routes through this same serialized acquisition before
      // it trips the provider. Invoke it directly here to isolate heartbeat TTL.
      await (
        manager as unknown as {
          acquireOwnerLease: (
            userId: string,
            streamId: string,
            tenantId: string | undefined,
            createdAt: number,
          ) => Promise<void>;
        }
      ).acquireOwnerLease('user-1', 'conv-17', undefined, createdAt);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);

      // Owner-side persistence can legitimately outlive the five-minute store TTL.
      await jest.advanceTimersByTimeAsync(6 * 60 * 1000);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);

      await manager.releaseOwnerLease('user-1', 'conv-17', undefined, createdAt);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
      // And the heartbeat is genuinely stopped, not just cleared once.
      await jest.advanceTimersByTimeAsync(6 * 60 * 1000);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not resurrect an owner lease when release races its initial registration', async () => {
    const { owner, jobStore } = await makeManagers();
    await owner.createJob('conv-owner-release-race', 'user-1', 'conv-owner-release-race');
    const createdAt = (await jobStore.getJob('conv-owner-release-race'))!.createdAt;
    const realRegister = jobStore.registerUserFinalization.bind(jobStore);
    let finishRegistration!: () => void;
    const registrationPending = new Promise<void>((resolve) => {
      finishRegistration = resolve;
    });
    jest.spyOn(jobStore, 'registerUserFinalization').mockImplementation(async (...args) => {
      if (args[4] === 'owner') {
        await registrationPending;
      }
      return realRegister(...args);
    });
    const privateOwner = owner as unknown as {
      acquireOwnerLease: (
        userId: string,
        streamId: string,
        tenantId: string | undefined,
        generationId: number,
      ) => Promise<void>;
    };

    const acquiring = privateOwner.acquireOwnerLease(
      'user-1',
      'conv-owner-release-race',
      undefined,
      createdAt,
    );
    await Promise.resolve();
    const releasing = owner.releaseOwnerLease(
      'user-1',
      'conv-owner-release-race',
      undefined,
      createdAt,
    );
    finishRegistration();
    await acquiring.catch(() => undefined);
    await releasing;

    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
  });

  it('does not trip a local replacement provider without a durable owner lease', async () => {
    const { owner, jobStore } = await makeManagers();
    const predecessor = await owner.createJob(
      'conv-local-replacement-fence',
      'user-1',
      'conv-local-replacement-fence',
    );
    jest
      .spyOn(jobStore, 'registerUserFinalization')
      .mockRejectedValue(new Error('marker store unavailable'));

    await expect(
      owner.createJob('conv-local-replacement-fence', 'user-1', 'conv-local-replacement-fence'),
    ).rejects.toThrow();

    expect(predecessor.abortController.signal.aborted).toBe(false);
    await expect(jobStore.getJob('conv-local-replacement-fence')).resolves.toMatchObject({
      status: 'running',
      userId: 'user-1',
    });
  });

  it('does not trip a locally-owned Stop without a durable owner lease', async () => {
    const { owner, jobStore } = await makeManagers();
    const job = await owner.createJob('conv-local-stop-fence', 'user-1', 'conv-local-stop-fence');
    const realRegister = jobStore.registerUserFinalization.bind(jobStore);
    jest.spyOn(jobStore, 'registerUserFinalization').mockImplementation(async (...args) => {
      if (args[4] === 'owner') {
        throw new Error('marker store unavailable');
      }
      return realRegister(...args);
    });

    const result = await owner.abortJob('conv-local-stop-fence');

    expect(result).toMatchObject({
      success: true,
      signalDelivered: false,
      signalPublished: false,
    });
    expect(job.abortController.signal.aborted).toBe(false);
    await expect(jobStore.getJob('conv-local-stop-fence')).resolves.toMatchObject({
      status: 'aborted',
      userId: 'user-1',
    });
  });

  it('keeps a failed remote replacement visible until retention is durable', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const owner = new GenerationJobManagerClass();
    owner.configure({ jobStore, eventTransport: new InMemoryEventTransport(), isRedis: false });
    owner.initialize();
    const peer = new GenerationJobManagerClass();
    const peerTransport = new InMemoryEventTransport();
    Object.assign(peerTransport, { emitAbortConfirmed: jest.fn(async () => false) });
    peer.configure({ jobStore, eventTransport: peerTransport, isRedis: true });
    peer.initialize();
    await owner.createJob('conv-remote-retention-fence', 'user-1', 'conv-remote-retention-fence');
    jest
      .spyOn(jobStore, 'registerUserFinalization')
      .mockRejectedValue(new Error('marker store unavailable'));

    await expect(
      peer.createJob('conv-remote-retention-fence', 'user-1', 'conv-remote-retention-fence'),
    ).rejects.toThrow();

    await expect(jobStore.getJob('conv-remote-retention-fence')).resolves.toMatchObject({
      status: 'running',
      userId: 'user-1',
    });
  });

  it('heartbeats a durably-established failed-handoff retention marker', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const owner = new GenerationJobManagerClass();
    owner.configure({ jobStore, eventTransport: new InMemoryEventTransport(), isRedis: false });
    owner.initialize();
    const peer = new GenerationJobManagerClass();
    const peerTransport = new InMemoryEventTransport();
    Object.assign(peerTransport, { emitAbortConfirmed: jest.fn(async () => false) });
    peer.configure({ jobStore, eventTransport: peerTransport, isRedis: true });
    peer.initialize();
    await owner.createJob('conv-18', 'user-1', 'conv-18');

    // The first marker must already be durable before createJob may reject and
    // release its caller-side admission lease. The heartbeat preserves that proof.
    jest.useFakeTimers({ now: Date.now() });
    try {
      await expect(peer.createJob('conv-18', 'user-1', 'conv-18')).rejects.toThrow(
        'predecessor handoff',
      );
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBeGreaterThanOrEqual(1);
      await jest.advanceTimersByTimeAsync(6 * 60_000);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBeGreaterThanOrEqual(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stands down a failed-handoff retainer after natural owner settlement is proven', async () => {
    const { GenerationJobManagerClass } = await import('../GenerationJobManager');
    const { InMemoryJobStore } = await import('../implementations/InMemoryJobStore');
    const { InMemoryEventTransport } = await import('../implementations/InMemoryEventTransport');
    const jobStore = new InMemoryJobStore({ ttlAfterComplete: 0 });
    const settlementProofs = new Set<string>();
    const proofKey = (streamId: string, generationId: number) => `${streamId}:${generationId}`;
    const recordGenerationSettlement = jest.fn(async (streamId: string, generationId: number) => {
      settlementProofs.add(proofKey(streamId, generationId));
      return true;
    });
    const ownerTransport = new InMemoryEventTransport();
    Object.assign(ownerTransport, { recordGenerationSettlement });
    const owner = new GenerationJobManagerClass();
    owner.configure({ jobStore, eventTransport: ownerTransport, isRedis: true });
    owner.initialize();

    const hasGenerationSettlement = jest.fn(async (streamId: string, generationId: number) =>
      settlementProofs.has(proofKey(streamId, generationId)),
    );
    const peerTransport = new InMemoryEventTransport();
    Object.assign(peerTransport, {
      emitAbortConfirmed: jest.fn(async () => false),
      hasAbortAcknowledgement: jest.fn(async () => false),
      hasGenerationSettlement,
    });
    const peer = new GenerationJobManagerClass();
    peer.configure({ jobStore, eventTransport: peerTransport, isRedis: true });
    peer.initialize();

    await owner.createJob('conv-natural-settlement', 'user-1', 'conv-natural-settlement');
    const predecessor = await jobStore.getJob('conv-natural-settlement');
    const register = jest.spyOn(jobStore, 'registerUserFinalization');

    jest.useFakeTimers({ now: Date.now() });
    try {
      await expect(
        peer.createJob('conv-natural-settlement', 'user-1', 'conv-natural-settlement'),
      ).rejects.toThrow('predecessor handoff');
      const ownerRegistrations = () => register.mock.calls.filter((call) => call[4] === 'owner');
      expect(ownerRegistrations()).toHaveLength(1);

      // A predecessor may finish naturally after the handoff publication failed,
      // so there is no abort ACK. Its settlement path writes the separate,
      // short-lived exact-generation proof before releasing the shared owner field.
      await owner.releaseOwnerLease(
        'user-1',
        'conv-natural-settlement',
        undefined,
        predecessor!.createdAt,
      );
      expect(recordGenerationSettlement).toHaveBeenCalledWith(
        'conv-natural-settlement',
        predecessor!.createdAt,
      );
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);

      const registrationsAtSettlement = ownerRegistrations().length;
      await jest.advanceTimersByTimeAsync(2 * 60_000);
      expect(hasGenerationSettlement).toHaveBeenCalledWith(
        'conv-natural-settlement',
        predecessor!.createdAt,
      );
      expect(ownerRegistrations()).toHaveLength(registrationsAtSettlement);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
    } finally {
      await Promise.allSettled([owner.destroy(), peer.destroy()]);
      jest.useRealTimers();
    }
  });

  it('reports republication as succeeded when the owner acknowledges', async () => {
    const { owner, peer, peerTransport, jobStore } = await makeManagers();
    await owner.createJob('conv-4', 'user-1', 'conv-4');
    await owner.abortJob('conv-4', { preserveForReconcile: true });
    expect((await jobStore.getJob('conv-4'))?.status).toBe('aborted');

    Object.assign(peerTransport, {
      emitAbort: jest.fn((): void => undefined),
      emitAbortConfirmed: jest.fn(async () => true),
    });

    const result = await peer.resignalAbort('conv-4');

    expect(result).toEqual({ delivered: false, published: true });
  });
});
