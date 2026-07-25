import { InMemoryJobStore } from '../implementations/InMemoryJobStore';

describe('InMemoryJobStore generation stamp allocation', () => {
  afterEach(() => jest.restoreAllMocks());

  /** Pins the wall clock so every create in a test lands in the same millisecond. */
  function freezeClock(at = 1_000_000): void {
    jest.spyOn(Date, 'now').mockReturnValue(at);
  }

  it('keeps stamps strictly monotonic when a streamId is reused', async () => {
    freezeClock();
    const store = new InMemoryJobStore();
    const first = await store.createJob('stream-1', 'user-1');
    const second = await store.createJob('stream-1', 'user-1');
    expect(second.createdAt).toBeGreaterThan(first.createdAt);
  });

  it('keeps stamps monotonic ACROSS a delete', async () => {
    freezeClock();
    const store = new InMemoryJobStore();
    const first = await store.createJob('stream-1', 'user-1');
    expect(await store.deleteJob('stream-1')).toBe(true);
    const replacement = await store.createJob('stream-1', 'user-1');
    // Seeding the next stamp from `jobs` made the sequence monotonic only while the job
    // existed. Delete-then-recreate is exactly what the fence guards, so a replacement
    // in the same millisecond used to inherit the deleted generation's stamp, and a
    // stale fenced cleanup carrying it would match and delete the LIVE replacement.
    expect(replacement.createdAt).toBeGreaterThan(first.createdAt);
  });

  it('refuses a stale fenced delete after a same-millisecond replacement', async () => {
    freezeClock();
    const store = new InMemoryJobStore();
    const doomed = await store.createJob('stream-1', 'user-1');
    await store.deleteJob('stream-1');
    await store.createJob('stream-1', 'user-1');
    // The end-to-end consequence: a cleanup holding the OLD generation's stamp must not
    // be able to delete the replacement that now owns this streamId.
    expect(await store.deleteJob('stream-1', doomed.createdAt)).toBe(false);
    expect(await store.getJob('stream-1')).not.toBeNull();
  });

  it('still deletes when the fence matches the live generation', async () => {
    freezeClock();
    const store = new InMemoryJobStore();
    const job = await store.createJob('stream-1', 'user-1');
    expect(await store.deleteJob('stream-1', job.createdAt)).toBe(true);
    expect(await store.getJob('stream-1')).toBeNull();
  });
});
