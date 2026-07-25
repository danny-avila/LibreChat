import { InMemoryEventTransport } from '~/stream/implementations/InMemoryEventTransport';
import { InMemoryJobStore } from '~/stream/implementations/InMemoryJobStore';
import { GenerationJobManagerClass } from '~/stream/GenerationJobManager';

jest.spyOn(console, 'log').mockImplementation();

/**
 * Start-generation idempotency: a retried start request for the SAME submission must
 * attach to the original stream instead of spawning a second billed generation, while a
 * distinct submission (including a regenerate) must NOT be deduped. See issue #14339.
 */
describe('InMemoryJobStore.claimIdempotencyKey', () => {
  let store: InMemoryJobStore;

  beforeEach(() => {
    store = new InMemoryJobStore({ ttlAfterComplete: 0 });
  });

  it('grants the first claim and returns the original stream to a duplicate', async () => {
    const first = await store.claimIdempotencyKey(
      'user:req',
      { streamId: 's1', conversationId: 'c1' },
      1200,
    );
    expect(first).toEqual({ claimed: true });

    // A retry that computed a different streamId still gets the ORIGINAL stream back.
    const second = await store.claimIdempotencyKey(
      'user:req',
      { streamId: 's2', conversationId: 'c2' },
      1200,
    );
    expect(second).toEqual({ claimed: false, existing: { streamId: 's1', conversationId: 'c1' } });
  });

  it('lets a released key be claimed again', async () => {
    await store.claimIdempotencyKey('user:req', { streamId: 's1', conversationId: 'c1' }, 1200);
    await store.releaseIdempotencyKey('user:req');

    const reclaimed = await store.claimIdempotencyKey(
      'user:req',
      { streamId: 's2', conversationId: 'c2' },
      1200,
    );
    expect(reclaimed).toEqual({ claimed: true });
  });

  it('clears claims on destroy so a reused store does not falsely dedup', async () => {
    await store.claimIdempotencyKey('user:req', { streamId: 's1', conversationId: 'c1' }, 1200);
    await store.destroy();
    const reclaimed = await store.claimIdempotencyKey(
      'user:req',
      { streamId: 's2', conversationId: 'c2' },
      1200,
    );
    expect(reclaimed).toEqual({ claimed: true });
  });

  it('treats distinct keys independently', async () => {
    const a = await store.claimIdempotencyKey(
      'user:reqA',
      { streamId: 's1', conversationId: 'c1' },
      1200,
    );
    const b = await store.claimIdempotencyKey(
      'user:reqB',
      { streamId: 's2', conversationId: 'c2' },
      1200,
    );
    expect(a).toEqual({ claimed: true });
    expect(b).toEqual({ claimed: true });
  });

  it('lets the key be reclaimed after its TTL elapses', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-07-20T00:00:00Z'));
      const first = await store.claimIdempotencyKey(
        'user:req',
        { streamId: 's1', conversationId: 'c1' },
        1,
      );
      expect(first).toEqual({ claimed: true });

      // Still held one moment before expiry.
      jest.setSystemTime(new Date('2026-07-20T00:00:00.999Z'));
      const held = await store.claimIdempotencyKey(
        'user:req',
        { streamId: 's2', conversationId: 'c2' },
        1,
      );
      expect(held.claimed).toBe(false);

      // Expired: the next caller wins.
      jest.setSystemTime(new Date('2026-07-20T00:00:02Z'));
      const expired = await store.claimIdempotencyKey(
        'user:req',
        { streamId: 's3', conversationId: 'c3' },
        1,
      );
      expect(expired).toEqual({ claimed: true });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('GenerationJobManager start-generation claim', () => {
  let manager: GenerationJobManagerClass;

  beforeEach(() => {
    manager = new GenerationJobManagerClass();
    manager.configure({
      jobStore: new InMemoryJobStore({ ttlAfterComplete: 0 }),
      eventTransport: new InMemoryEventTransport(),
      isRedis: false,
    });
    manager.initialize();
  });

  afterEach(async () => {
    await manager.destroy();
  });

  it('dedups a retry of the same submission to the original stream', async () => {
    const first = await manager.claimGeneration('user-1', 'req-1', 'stream-a', 'convo-a');
    expect(first).toEqual({ claimed: true });

    const retry = await manager.claimGeneration('user-1', 'req-1', 'stream-b', 'convo-b');
    expect(retry.claimed).toBe(false);
    expect(retry.existing).toEqual(
      expect.objectContaining({ streamId: 'stream-a', conversationId: 'convo-a' }),
    );
    expect(typeof retry.existing?.claimedAt).toBe('number');
  });

  it('does NOT dedup a distinct submission (e.g. regenerate reuses the user message id)', async () => {
    await manager.claimGeneration('user-1', 'req-1', 'stream-a', 'convo-a');
    // A regenerate is a fresh ask() → fresh clientRequestId, so it must start its own generation.
    const regenerate = await manager.claimGeneration('user-1', 'req-2', 'stream-a', 'convo-a');
    expect(regenerate).toEqual({ claimed: true });
  });

  it('scopes claims per user', async () => {
    await manager.claimGeneration('user-1', 'req-1', 'stream-a', 'convo-a');
    const otherUser = await manager.claimGeneration('user-2', 'req-1', 'stream-z', 'convo-z');
    expect(otherUser).toEqual({ claimed: true });
  });

  it('allows a fresh claim after release', async () => {
    await manager.claimGeneration('user-1', 'req-1', 'stream-a', 'convo-a');
    await manager.releaseGeneration('user-1', 'req-1');
    const again = await manager.claimGeneration('user-1', 'req-1', 'stream-c', 'convo-c');
    expect(again).toEqual({ claimed: true });
  });
});
