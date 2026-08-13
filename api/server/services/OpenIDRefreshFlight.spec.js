jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
  },
  encryptV2: jest.fn(async (value) => `encrypted:${value}`),
  decryptV2: jest.fn(async (value) => value.replace(/^encrypted:/, '')),
}));

jest.mock('~/models', () => ({
  acquireOpenIDRefreshFlight: jest.fn(),
  completeOpenIDRefreshFlight: jest.fn(),
  failOpenIDRefreshFlight: jest.fn(),
  findOpenIDRefreshFlight: jest.fn(),
}));

const { encryptV2, decryptV2 } = require('@librechat/data-schemas');
const db = require('~/models');
const {
  acquireOpenIDRefreshFlight,
  completeOpenIDRefreshFlight,
  createOpenIDRefreshFlightKey,
  failOpenIDRefreshFlight,
  waitForOpenIDRefreshFlight,
  __internals,
} = require('./OpenIDRefreshFlight');

describe('OpenIDRefreshFlight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.acquireOpenIDRefreshFlight.mockResolvedValue({ acquired: true, flight: null });
    db.completeOpenIDRefreshFlight.mockResolvedValue({});
    db.failOpenIDRefreshFlight.mockResolvedValue({});
    db.findOpenIDRefreshFlight.mockResolvedValue(null);
  });

  it('creates a stable hash key from session, user, issuer, tenant, and refresh token', () => {
    const req = {
      sessionID: 'session-1',
      user: { tenantId: 'tenant-1', openidIssuer: 'issuer-1' },
    };
    const user = { openidId: 'oidc-sub-1' };

    const keyA = createOpenIDRefreshFlightKey({ req, user, refreshToken: 'rt-old' });
    const keyB = createOpenIDRefreshFlightKey({ req, user, refreshToken: 'rt-old' });
    const keyC = createOpenIDRefreshFlightKey({ req, user, refreshToken: 'rt-other' });

    expect(keyA).toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA).not.toContain('rt-old');
  });

  it('uses explicit identity context when safe user lacks tenant and issuer', () => {
    const req = {
      sessionID: 'session-1',
      user: { id: 'safe-user' },
    };
    const user = { id: 'safe-user' };

    const keyA = createOpenIDRefreshFlightKey({
      req,
      user,
      refreshToken: 'rt-old',
      identityContext: {
        openidSubject: 'oidc-sub-1',
        tenantId: 'tenant-a',
        openidIssuer: 'https://issuer-a.example.com',
      },
    });
    const keyB = createOpenIDRefreshFlightKey({
      req,
      user,
      refreshToken: 'rt-old',
      identityContext: {
        openidSubject: 'oidc-sub-1',
        tenantId: 'tenant-b',
        openidIssuer: 'https://issuer-a.example.com',
      },
    });

    expect(keyA).not.toBe(keyB);
  });

  it('returns null key when identity or refresh token is unavailable', () => {
    expect(createOpenIDRefreshFlightKey({ req: {}, user: {}, refreshToken: 'rt' })).toBeNull();
    expect(
      createOpenIDRefreshFlightKey({
        req: { user: { id: 'user-1' } },
        user: undefined,
        refreshToken: undefined,
      }),
    ).toBeNull();
  });

  it('acquires a Mongo flight with owner and expiry metadata', async () => {
    const result = await acquireOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      ttl: 60000,
      lockTtl: 30000,
    });

    expect(result.acquired).toBe(true);
    expect(result.key).toBe('flight-key');
    expect(result.ownerId).toBe('owner-1');
    expect(db.acquireOpenIDRefreshFlight).toHaveBeenCalledWith({
      key: 'flight-key',
      ownerId: 'owner-1',
      lockExpiresAt: expect.any(Date),
      expiresAt: expect.any(Date),
    });
  });

  it('encrypts completed token results before storing them', async () => {
    const tokens = {
      access_token: 'access',
      id_token: 'id',
      refresh_token: 'refresh',
      expires_at: 123,
    };

    await completeOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      tokens,
      ttl: 60000,
    });

    expect(encryptV2).toHaveBeenCalledWith(JSON.stringify(tokens));
    expect(db.completeOpenIDRefreshFlight).toHaveBeenCalledWith({
      key: 'flight-key',
      ownerId: 'owner-1',
      encryptedResult: `encrypted:${JSON.stringify(tokens)}`,
      expiresAt: expect.any(Date),
    });
  });

  it('preserves non-enumerable browser refresh-token metadata for shared flight joiners', async () => {
    const tokens = {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_at: 123,
    };
    Object.defineProperty(tokens, '__browserRefreshToken', {
      value: 'browser-refresh',
      enumerable: false,
    });

    await completeOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      tokens,
      ttl: 60000,
    });

    const serializedTokens = JSON.parse(encryptV2.mock.calls[0][0]);
    expect(serializedTokens.__browserRefreshToken).toBe('browser-refresh');
    expect(Object.keys(tokens)).not.toContain('__browserRefreshToken');
  });

  it('marks a flight failed with a non-sensitive message', async () => {
    await failOpenIDRefreshFlight({
      key: 'flight-key',
      ownerId: 'owner-1',
      error: new Error('invalid_grant'),
      ttl: 60000,
    });

    expect(db.failOpenIDRefreshFlight).toHaveBeenCalledWith({
      key: 'flight-key',
      ownerId: 'owner-1',
      errorMessage: 'invalid_grant',
      expiresAt: expect.any(Date),
    });
  });

  it('waits for and decrypts a completed flight result', async () => {
    const tokens = { access_token: 'access', refresh_token: 'refresh', expires_at: 123 };
    db.findOpenIDRefreshFlight.mockResolvedValueOnce({
      status: 'completed',
      encryptedResult: `encrypted:${JSON.stringify(tokens)}`,
    });

    const result = await waitForOpenIDRefreshFlight({
      key: 'flight-key',
      timeoutMs: 1,
      intervalMs: 1,
    });

    expect(decryptV2).toHaveBeenCalledWith(`encrypted:${JSON.stringify(tokens)}`);
    expect(result).toEqual(tokens);
  });

  it('throws when another worker records a failed flight', async () => {
    db.findOpenIDRefreshFlight.mockResolvedValueOnce({
      status: 'failed',
      errorMessage: 'invalid_grant',
    });

    await expect(
      waitForOpenIDRefreshFlight({ key: 'flight-key', timeoutMs: 1, intervalMs: 1 }),
    ).rejects.toThrow('invalid_grant');
  });

  it('exposes completed-flight parsing for focused tests', async () => {
    const tokens = { access_token: 'access' };
    await expect(
      __internals.readCompletedFlight({
        status: 'completed',
        encryptedResult: `encrypted:${JSON.stringify(tokens)}`,
      }),
    ).resolves.toEqual(tokens);
  });

  it('restores browser refresh-token metadata as non-enumerable', async () => {
    const result = await __internals.readCompletedFlight({
      status: 'completed',
      encryptedResult:
        'encrypted:{"access_token":"access","__browserRefreshToken":"browser-refresh"}',
    });

    expect(result.__browserRefreshToken).toBe('browser-refresh');
    expect(Object.keys(result)).toEqual(['access_token']);
  });
});
