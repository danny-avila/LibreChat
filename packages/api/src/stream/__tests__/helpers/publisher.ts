export interface MockPublisher {
  publish: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
  eval: jest.Mock;
}

/** Mock publisher with Redis command simulation for atomic sequence counters */
export function createMockPublisher(): MockPublisher {
  const counters = new Map<string, number>();
  const publisher: MockPublisher = {
    publish: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockImplementation((key: string) => {
      const current = (counters.get(key) ?? 0) + 1;
      counters.set(key, current);
      return Promise.resolve(current);
    }),
    expire: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockImplementation((key: string) => {
      const val = counters.get(key);
      return Promise.resolve(val != null ? String(val) : null);
    }),
    del: jest.fn().mockImplementation((...keys: string[]) => {
      for (const key of keys) {
        counters.delete(key);
      }
      return Promise.resolve(keys.length);
    }),
    eval: jest.fn(),
  };

  /**
   * Stands in for PUBLISH_SEQ_LUA, which allocates the sequence and publishes in one server-side
   * round trip. Delegates to the incr/publish mocks rather than reimplementing them, so a test
   * can still fail either half independently and observe the ordering between them.
   */
  publisher.eval.mockImplementation(
    async (
      _script: string,
      _numKeys: number,
      seqKey: string,
      channel: string,
      prefix: string,
      suffix: string,
      ttlSeconds: string,
    ) => {
      const val = (await publisher.incr(seqKey)) as number;
      if (val === 1) {
        await publisher.expire(seqKey, Number(ttlSeconds));
      }
      const seq = val - 1;
      await publisher.publish(channel, `${prefix}${seq}${suffix}`);
      return seq;
    },
  );

  return publisher;
}
