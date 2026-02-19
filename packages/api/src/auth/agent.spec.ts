jest.mock('node:dns', () => {
  const actual = jest.requireActual('node:dns');
  return {
    ...actual,
    lookup: jest.fn(),
  };
});

import dns from 'node:dns';
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
