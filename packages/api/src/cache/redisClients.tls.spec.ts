import { createClient } from '@redis/client';

describe('node-redis TLS URI handling', () => {
  it('accepts rediss:// without a custom CA', () => {
    expect(() => createClient({ url: 'rediss://localhost:6380' })).not.toThrow();
  });

  it('accepts rediss:// with custom CA material', () => {
    expect(() =>
      createClient({
        url: 'rediss://localhost:6380',
        socket: { ca: 'test-ca' },
      }),
    ).not.toThrow();
  });

  it('rejects an explicit TLS mismatch with a rediss:// URL', () => {
    expect(() =>
      createClient({
        url: 'rediss://localhost:6380',
        socket: { tls: false },
      }),
    ).toThrow(/tls socket option.*mismatch/i);
  });
});
