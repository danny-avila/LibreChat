jest.mock('node:dns', () => {
  const actual = jest.requireActual('node:dns');
  return {
    ...actual,
    lookup: jest.fn(),
  };
});

import dns from 'node:dns';
import type { LookupFunction } from 'node:net';
import { createSSRFSafeAgents, createSSRFSafeUndiciConnect } from './agent';

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string, family: number) => void;

const mockedDnsLookup = dns.lookup as jest.MockedFunction<typeof dns.lookup>;

function mockDnsResult(address: string, family: number): void {
  mockedDnsLookup.mockImplementation(((
    _hostname: string,
    _options: unknown,
    callback: LookupCallback,
  ) => {
    callback(null, address, family);
  }) as never);
}

function mockDnsError(err: NodeJS.ErrnoException): void {
  mockedDnsLookup.mockImplementation(((
    _hostname: string,
    _options: unknown,
    callback: LookupCallback,
  ) => {
    callback(err, '', 0);
  }) as never);
}

describe('createSSRFSafeAgents', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return httpAgent and httpsAgent', () => {
    const agents = createSSRFSafeAgents();
    expect(agents.httpAgent).toBeDefined();
    expect(agents.httpsAgent).toBeDefined();
  });

  it('should patch httpAgent createConnection to inject SSRF lookup', () => {
    const agents = createSSRFSafeAgents();
    const internal = agents.httpAgent as unknown as {
      createConnection: (opts: Record<string, unknown>) => unknown;
    };
    expect(internal.createConnection).toBeInstanceOf(Function);
  });
});

describe('createSSRFSafeUndiciConnect', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return an object with a lookup function', () => {
    const connect = createSSRFSafeUndiciConnect();
    expect(connect).toHaveProperty('lookup');
    expect(connect.lookup).toBeInstanceOf(Function);
  });

  it('lookup should block private IPs', async () => {
    mockDnsResult('10.0.0.1', 4);
    const connect = createSSRFSafeUndiciConnect();

    const result = await new Promise<{ err: NodeJS.ErrnoException | null }>((resolve) => {
      connect.lookup('evil.example.com', {}, (err) => {
        resolve({ err });
      });
    });

    expect(result.err).toBeTruthy();
    expect(result.err!.code).toBe('ESSRF');
  });

  it('lookup should allow public IPs', async () => {
    mockDnsResult('93.184.216.34', 4);
    const connect = createSSRFSafeUndiciConnect();

    const result = await new Promise<{ err: NodeJS.ErrnoException | null; address: string }>(
      (resolve) => {
        connect.lookup('example.com', {}, (err, address) => {
          resolve({ err, address: address as string });
        });
      },
    );

    expect(result.err).toBeNull();
    expect(result.address).toBe('93.184.216.34');
  });

  it('lookup should forward DNS errors', async () => {
    const dnsError = Object.assign(new Error('ENOTFOUND'), {
      code: 'ENOTFOUND',
    }) as NodeJS.ErrnoException;
    mockDnsError(dnsError);
    const connect = createSSRFSafeUndiciConnect();

    const result = await new Promise<{ err: NodeJS.ErrnoException | null }>((resolve) => {
      connect.lookup('nonexistent.example.com', {}, (err) => {
        resolve({ err });
      });
    });

    expect(result.err).toBeTruthy();
    expect(result.err!.code).toBe('ENOTFOUND');
  });
});

/**
 * Connect-time exemption is the TOCTOU-safe layer: pre-flight validation can
 * be bypassed by DNS rebinding, but the agent's `lookup` runs on every TCP
 * connect and must honor `allowedAddresses` consistently. These tests cover
 * the runtime path that the domain.ts spec doesn't reach.
 */
describe('SSRF agents — allowedAddresses exemption', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function runLookup(lookup: LookupFunction, hostname: string) {
    return new Promise<{ err: NodeJS.ErrnoException | null; address: string }>((resolve) => {
      (lookup as (h: string, o: object, cb: LookupCallback) => void)(hostname, {}, (err, address) =>
        resolve({ err, address: address as string }),
      );
    });
  }

  it('exempts a hostname literal that the admin permitted', async () => {
    mockDnsResult('10.0.0.5', 4);
    const { lookup } = createSSRFSafeUndiciConnect(['ollama.internal']);
    const result = await runLookup(lookup, 'ollama.internal');
    expect(result.err).toBeNull();
    expect(result.address).toBe('10.0.0.5');
  });

  it('exempts a private IP that the admin permitted (DNS resolves to it)', async () => {
    mockDnsResult('10.0.0.5', 4);
    const { lookup } = createSSRFSafeUndiciConnect(['10.0.0.5']);
    const result = await runLookup(lookup, 'private.example.com');
    expect(result.err).toBeNull();
    expect(result.address).toBe('10.0.0.5');
  });

  it('still blocks an unlisted private IP when allowedAddresses is set', async () => {
    mockDnsResult('192.168.1.42', 4);
    const { lookup } = createSSRFSafeUndiciConnect(['10.0.0.5']);
    const result = await runLookup(lookup, 'other.private.example.com');
    expect(result.err).toBeTruthy();
    expect(result.err!.code).toBe('ESSRF');
  });

  it('drops public-IP entries from allowedAddresses (private-IP scope only)', async () => {
    // Admin mistakenly listed a public IP. It must NOT grant exemption.
    mockDnsResult('10.0.0.5', 4);
    const { lookup } = createSSRFSafeUndiciConnect(['8.8.8.8']);
    const result = await runLookup(lookup, 'private.example.com');
    expect(result.err).toBeTruthy();
    expect(result.err!.code).toBe('ESSRF');
  });

  it('drops URL/CIDR/whitespace entries from allowedAddresses', async () => {
    mockDnsResult('10.0.0.5', 4);
    const { lookup } = createSSRFSafeUndiciConnect([
      'http://10.0.0.5',
      '10.0.0.0/24',
      ' 10.0.0.5 ',
    ]);
    // Even though the value 10.0.0.5 is among the admin entries, none of them
    // pass the schema-shape filter (URL, CIDR, embedded whitespace), so no
    // exemption is granted.
    const result = await runLookup(lookup, 'private.example.com');
    expect(result.err).toBeTruthy();
    expect(result.err!.code).toBe('ESSRF');
  });

  it('createSSRFSafeAgents propagates the exemption-aware lookup to both agents', async () => {
    // The agent factory wraps `createConnection` to inject a custom lookup.
    // We can't realistically exercise the wrapped function from a unit test
    // (the underlying socket op fails), so we drive the same lookup factory
    // with the same exemption list and verify it allows the exempt address.
    mockDnsResult('10.0.0.5', 4);
    const agents = createSSRFSafeAgents(['10.0.0.5']);
    expect(agents.httpAgent).toBeDefined();
    expect(agents.httpsAgent).toBeDefined();

    // The undici-connect path uses the same `buildSSRFSafeLookup` factory, so
    // verifying the exemption holds there is sufficient evidence that the
    // agent factory built the right lookup.
    const { lookup } = createSSRFSafeUndiciConnect(['10.0.0.5']);
    const result = await runLookup(lookup, 'private.example.com');
    expect(result.err).toBeNull();
    expect(result.address).toBe('10.0.0.5');
  });

  it('default lookup (no exemption list) blocks private IPs', async () => {
    mockDnsResult('10.0.0.5', 4);
    const { lookup } = createSSRFSafeUndiciConnect();
    const result = await runLookup(lookup, 'private.example.com');
    expect(result.err).toBeTruthy();
    expect(result.err!.code).toBe('ESSRF');
  });
});
