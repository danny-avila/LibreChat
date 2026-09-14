const {
  setScheduleUpstreamTokenProviderResolver,
  resolveScheduleUpstreamTokenProvider,
} = require('./upstreamToken');

describe('schedule upstream-token resolver', () => {
  afterEach(() => setScheduleUpstreamTokenProviderResolver(undefined));

  it('returns undefined when no resolver is registered', async () => {
    await expect(resolveScheduleUpstreamTokenProvider({ id: 'user-1' })).resolves.toBeUndefined();
  });

  it('resolves a fresh provider without exposing credentials to the caller', async () => {
    const provider = jest.fn();
    const signal = new AbortController().signal;
    const resolver = jest.fn().mockResolvedValue(provider);
    setScheduleUpstreamTokenProviderResolver(resolver);

    await expect(resolveScheduleUpstreamTokenProvider({ id: 'user-1' }, { signal })).resolves.toBe(
      provider,
    );
    expect(resolver).toHaveBeenCalledWith({ id: 'user-1' }, { signal });
  });

  it('rejects non-function resolvers', () => {
    expect(() => setScheduleUpstreamTokenProviderResolver('invalid')).toThrow(TypeError);
  });
});
