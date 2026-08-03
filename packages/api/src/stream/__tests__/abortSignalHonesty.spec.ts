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
    await owner.createJob('conv-7', 'user-1', 'conv-7');

    const result = await peer.abortJob('conv-7', { expectedCreatedAt: observed!.createdAt });

    expect(result.success).toBe(false);
    // Nothing will be persisted by this loser: holding the marker to its TTL would
    // fence the user's deletion pointlessly.
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
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
    // The job is terminal (invisible to active-set scans) and a user Stop writes no
    // durable abort fence — this lease is the ONLY thing deferring a deletion
    // quiesce while the remote owner keeps generating.
    await new Promise((resolve) => setImmediate(resolve));
    await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(1);
  });

  it('renews the fence on each undelivered resignal attempt', async () => {
    const { owner, peer, peerTransport, jobStore } = await makeManagers();
    await owner.createJob('conv-9', 'user-1', 'conv-9');
    Object.assign(peerTransport, {
      emitAbort: jest.fn((): void => undefined),
      emitAbortConfirmed: jest.fn(async () => false),
    });
    await peer.abortJob('conv-9');
    const register = jest.spyOn(jobStore, 'registerUserFinalization');

    const resignal = await peer.resignalAbort('conv-9');

    expect(resignal).toEqual({ delivered: false, published: false });
    // The 5-minute lease is never self-renewing: each retry heartbeats a fresh one
    // so the quiesce keeps deferring for as long as delivery is still being driven.
    expect(register).toHaveBeenCalledWith(
      'user-1',
      'conv-9',
      undefined,
      expect.any(Number),
      expect.any(String),
    );
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

      hold.release();
      await jest.advanceTimersByTimeAsync(1);
      await expect(jobStore.countUserFinalizations('user-1')).resolves.toBe(0);
    } finally {
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
