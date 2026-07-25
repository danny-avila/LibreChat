import type { Redis } from 'ioredis';
import { RedisJobStore } from '../implementations/RedisJobStore';

/**
 * Records every `eval` and answers them the way the real scripts would, so the test
 * asserts on the SHAPE of the create path (how many scripts commit state, and in what
 * order) rather than on Redis behavior.
 */
function makeRedisStub(options?: { failCreate?: boolean }) {
  const evals: Array<{ script: string; args: string[] }> = [];
  const hash = new Map<string, string>();
  /** The generation key, which the job delete deliberately leaves alone. */
  const generation = new Map<string, string>();
  const redis = {
    isCluster: false,
    eval: jest.fn(async (script: string, numKeys: number, ...rest: unknown[]) => {
      const args = rest.map(String);
      evals.push({ script, args });
      if (!script.includes('"createdAt", stamp')) {
        return 1;
      }
      if (options?.failCreate) {
        throw new Error('LOADING Redis is loading the dataset in memory');
      }
      // ARGV after the keys: [ttl, hdelCount, callerNowMs, generationTtl, ...].
      const genKey = args[3];
      const now = Number(args[numKeys + 2]);
      const candidates = [Number(generation.get(genKey)), Number(hash.get('createdAt'))].filter(
        (value) => Number.isFinite(value),
      );
      const prev = candidates.length > 0 ? Math.max(...candidates) : undefined;
      const stamp = prev != null && prev >= now ? prev + 1 : now;
      generation.set(genKey, String(stamp));
      hash.set('createdAt', String(stamp));
      return stamp;
    }),
    pipeline: () => ({
      sadd: jest.fn(),
      srem: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn(async () => []),
    }),
    hgetall: jest.fn(async () => Object.fromEntries(hash)),
  };
  return { redis: redis as unknown as Redis, evals, hash, generation };
}

describe('RedisJobStore generation stamp allocation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('commits the stamp in the SAME script that creates the job', async () => {
    const { redis, evals } = makeRedisStub();
    const store = new RedisJobStore(redis);
    await store.createJob('stream-1', 'user-1');
    // A separate reservation script would leave the stamp committed on its own when the
    // create then fails: re-fencing a still-live job so its owner can no longer perform
    // guarded transitions, or leaving a partial TTL-less hash that is absent from
    // runningJobs and so invisible to the periodic cleanup.
    expect(evals).toHaveLength(1);
    expect(evals[0].script).toContain('"createdAt", stamp');
  });

  it('returns the stamp the script actually committed', async () => {
    const { redis, hash } = makeRedisStub();
    const store = new RedisJobStore(redis);
    const job = await store.createJob('stream-1', 'user-1');
    // The job object and the persisted hash must agree, or every fenced operation
    // derived from this object would be refused by its own generation.
    expect(String(job.createdAt)).toBe(hash.get('createdAt'));
  });

  it('writes nothing when the create script fails', async () => {
    const { redis, hash } = makeRedisStub({ failCreate: true });
    const store = new RedisJobStore(redis);
    await expect(store.createJob('stream-1', 'user-1')).rejects.toThrow();
    // No partial state: a failed create must not leave a stamp behind.
    expect(hash.has('createdAt')).toBe(false);
  });

  it('keeps stamps strictly monotonic when a streamId is reused', async () => {
    const { redis } = makeRedisStub();
    const store = new RedisJobStore(redis);
    const first = await store.createJob('stream-1', 'user-1');
    const second = await store.createJob('stream-1', 'user-1');
    // createdAt is the generation fence, so a replacement must never be able to
    // collide with (or regress below) the generation it replaces.
    expect(second.createdAt).toBeGreaterThan(first.createdAt);
  });

  it('keeps stamps monotonic ACROSS a delete', async () => {
    const { redis, hash } = makeRedisStub();
    const store = new RedisJobStore(redis);
    const first = await store.createJob('stream-1', 'user-1');
    // The job hash is gone, exactly as JOB_DELETE_LUA leaves it.
    hash.clear();
    const replacement = await store.createJob('stream-1', 'user-1');
    // Delete-then-recreate is precisely what the fence guards. Deriving the stamp from
    // the job hash alone reset the sequence to the wall clock here, so a replacement in
    // the same millisecond as the deleted generation inherited its exact stamp and a
    // stale fenced cleanup would match and delete the LIVE replacement.
    expect(replacement.createdAt).toBeGreaterThan(first.createdAt);
  });

  it('remembers the stamp in a key the job delete does not touch', async () => {
    const { redis, generation } = makeRedisStub();
    const store = new RedisJobStore(redis);
    const job = await store.createJob('stream-1', 'user-1');
    expect(generation.get('stream:{stream-1}:gen')).toBe(String(job.createdAt));
  });
});
