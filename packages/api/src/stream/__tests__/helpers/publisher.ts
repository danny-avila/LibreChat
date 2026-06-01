export interface MockPublisher {
  publish: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
}

/** Mock publisher with Redis command simulation for atomic sequence counters */
export function createMockPublisher(): MockPublisher {
  const counters = new Map<string, number>();
  return {
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
  };
}
