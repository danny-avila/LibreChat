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
