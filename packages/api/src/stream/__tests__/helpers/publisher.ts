/** Mock publisher with Redis command simulation for atomic sequence counters */
export function createMockPublisher() {
  const counters = new Map<string, number>();
  return {
    publish: jest.fn().mockResolvedValue(1),
    eval: jest.fn().mockImplementation((_script: string, _numKeys: number, key: string) => {
      const current = (counters.get(key) ?? 0) + 1;
      counters.set(key, current);
      return Promise.resolve(current);
    }),
    get: jest.fn().mockImplementation((key: string) => {
      const val = counters.get(key);
      return Promise.resolve(val != null ? String(val) : null);
    }),
    del: jest.fn().mockImplementation((key: string) => {
      counters.delete(key);
      return Promise.resolve(1);
    }),
  };
}
