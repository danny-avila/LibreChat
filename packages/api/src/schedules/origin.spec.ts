import { selfOriginFromAddress } from './origin';

describe('selfOriginFromAddress', () => {
  it('brackets an IPv6 bind so the loopback fire reaches the listener', () => {
    // The shipped `HOST=localhost` resolves to ::1 on dual-stack hosts, so the
    // server binds v6-only and a hardcoded 127.0.0.1 fire is refused.
    expect(selfOriginFromAddress({ address: '::1', family: 'IPv6', port: 3080 })).toBe(
      'http://[::1]:3080',
    );
  });

  it('uses the assigned port, not the configured one, so PORT=0 works', () => {
    expect(selfOriginFromAddress({ address: '127.0.0.1', family: 'IPv4', port: 54321 })).toBe(
      'http://127.0.0.1:54321',
    );
  });

  it('targets the loopback of the same family for a wildcard bind', () => {
    expect(selfOriginFromAddress({ address: '0.0.0.0', family: 'IPv4', port: 3080 })).toBe(
      'http://127.0.0.1:3080',
    );
    expect(selfOriginFromAddress({ address: '::', family: 'IPv6', port: 3080 })).toBe(
      'http://[::1]:3080',
    );
  });

  it('keeps a specific non-loopback bind address', () => {
    expect(selfOriginFromAddress({ address: '10.0.0.5', family: 'IPv4', port: 8080 })).toBe(
      'http://10.0.0.5:8080',
    );
  });

  it('accepts the numeric family some Node versions report', () => {
    expect(selfOriginFromAddress({ address: '::1', family: 6, port: 3080 })).toBe(
      'http://[::1]:3080',
    );
  });

  it('returns null for a pipe/socket bind or a missing address', () => {
    expect(selfOriginFromAddress('/tmp/app.sock')).toBeNull();
    expect(selfOriginFromAddress(null)).toBeNull();
    expect(selfOriginFromAddress(undefined)).toBeNull();
  });
});
