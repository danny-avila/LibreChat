import { InMemoryJobStore } from '../implementations/InMemoryJobStore';

describe('InMemoryJobStore user finalizations', () => {
  let store: InMemoryJobStore;

  beforeEach(() => {
    store = new InMemoryJobStore();
  });

  afterEach(async () => {
    await store.destroy();
    jest.useRealTimers();
  });

  it('counts a registered finalization until it is cleared', async () => {
    await store.registerUserFinalization('user-1', 'conv-1');

    await expect(store.countUserFinalizations('user-1')).resolves.toBe(1);
    await expect(store.countUserFinalizations('user-2')).resolves.toBe(0);

    await store.clearUserFinalization('user-1', 'conv-1');
    await expect(store.countUserFinalizations('user-1')).resolves.toBe(0);
  });

  it('scopes markers by tenant-qualified user key', async () => {
    await store.registerUserFinalization('user-1', 'conv-1', 'tenant-a');

    await expect(store.countUserFinalizations('user-1', 'tenant-a')).resolves.toBe(1);
    // Same user id in a different (or no) tenant is a different key.
    await expect(store.countUserFinalizations('user-1')).resolves.toBe(0);
    await expect(store.countUserFinalizations('user-1', 'tenant-b')).resolves.toBe(0);
  });

  it('expires a marker whose owner crashed before clearing it', async () => {
    jest.useFakeTimers({ now: Date.now() });
    await store.registerUserFinalization('user-1', 'conv-crashed');
    await expect(store.countUserFinalizations('user-1')).resolves.toBe(1);

    // Deletion quiescing defers on live markers, so an owner that died between
    // register and clear must only fence deletion for the TTL — never forever.
    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    await expect(store.countUserFinalizations('user-1')).resolves.toBe(0);
  });

  it('keeps other streams live when one is cleared', async () => {
    await store.registerUserFinalization('user-1', 'conv-1');
    await store.registerUserFinalization('user-1', 'conv-2');

    await store.clearUserFinalization('user-1', 'conv-1');

    await expect(store.countUserFinalizations('user-1')).resolves.toBe(1);
  });

  it('qualifies markers by generation: a late clear from A cannot drop B on the same stream', async () => {
    // Generation A (a Stop-superseded turn) finishes late and clears AFTER
    // generation B — a replacement on the SAME conversation — registered its own
    // marker. Keyed by streamId alone, A's clear erased B's fence and a deletion
    // quiesce could confirm settlement while B's response save was still landing.
    await store.registerUserFinalization('user-1', 'conv-1', undefined, 1000);
    await store.registerUserFinalization('user-1', 'conv-1', undefined, 2000);

    await store.clearUserFinalization('user-1', 'conv-1', undefined, 1000);

    await expect(store.countUserFinalizations('user-1')).resolves.toBe(1);
    await store.clearUserFinalization('user-1', 'conv-1', undefined, 2000);
    await expect(store.countUserFinalizations('user-1')).resolves.toBe(0);
  });

  it('an unqualified legacy clear does not drop generation-qualified markers', async () => {
    await store.registerUserFinalization('user-1', 'conv-1', undefined, 1000);

    await store.clearUserFinalization('user-1', 'conv-1');

    await expect(store.countUserFinalizations('user-1')).resolves.toBe(1);
  });
});
