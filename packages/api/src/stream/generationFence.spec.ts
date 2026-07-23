import { InMemoryJobStore } from './implementations/InMemoryJobStore';
import { nextGenerationStamp } from './generationStamp';

describe('generation stamp monotonicity', () => {
  it('never repeats a stamp for the same stream, even within one millisecond', () => {
    const first = nextGenerationStamp(undefined);
    const second = nextGenerationStamp(first);
    const third = nextGenerationStamp(second);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('uses wall-clock time once it has moved past the previous stamp', () => {
    const stale = Date.now() - 10_000;
    expect(nextGenerationStamp(stale)).toBeGreaterThan(stale + 1);
  });
});

describe('replacement job vs stale abort/delete', () => {
  it('refuses a delete carrying a superseded generation stamp', async () => {
    const store = new InMemoryJobStore();
    const original = await store.createJob('convo-1', 'user-1');

    // A replacement generation reuses the SAME streamId (streamId === conversationId).
    const replacement = await store.createJob('convo-1', 'user-1');
    expect(replacement.createdAt).toBeGreaterThan(original.createdAt);

    // A stale caller that read the ORIGINAL job then tries to delete must not destroy
    // the replacement. This is the TOCTOU that read-then-delete could not prevent.
    expect(await store.deleteJob('convo-1', original.createdAt)).toBe(false);
    expect(await store.getJob('convo-1')).not.toBeNull();

    // The current generation's own stamp still deletes.
    expect(await store.deleteJob('convo-1', replacement.createdAt)).toBe(true);
    expect(await store.getJob('convo-1')).toBeNull();
  });

  it('deletes unconditionally when no generation is specified (unchanged behavior)', async () => {
    const store = new InMemoryJobStore();
    await store.createJob('convo-2', 'user-1');
    expect(await store.deleteJob('convo-2')).toBe(true);
    expect(await store.getJob('convo-2')).toBeNull();
  });

  it('mints distinct stamps for back-to-back replacements of one stream', async () => {
    const store = new InMemoryJobStore();
    const stamps: number[] = [];
    for (let i = 0; i < 5; i++) {
      stamps.push((await store.createJob('convo-3', 'user-1')).createdAt);
    }
    // Same millisecond is entirely possible here; the fence must still be unique.
    expect(new Set(stamps).size).toBe(stamps.length);
  });
});
