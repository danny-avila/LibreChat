import { generateKeyPairSync } from 'crypto';
import {
  GitHubAppAuthError,
  appAuthErrorMessage,
  createGitHubAppTokenProvider,
  mintAppJwt,
  normalizePrivateKey,
} from './github-app-auth';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const TEST_PEM = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
}).privateKey;

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('normalizePrivateKey', () => {
  it('passes through a raw multi-line PEM', () => {
    expect(normalizePrivateKey(TEST_PEM)).toBe(TEST_PEM.trim());
  });

  it('un-escapes literal \\n sequences', () => {
    const escaped = TEST_PEM.replace(/\n/g, '\\n');
    const result = normalizePrivateKey(escaped);
    expect(result).toContain('-----BEGIN');
    expect(result).not.toContain('\\n');
    expect(result.split('\n').length).toBe(TEST_PEM.split('\n').length);
  });

  it('decodes a base64-encoded PEM', () => {
    const b64 = Buffer.from(TEST_PEM, 'utf8').toString('base64');
    const result = normalizePrivateKey(b64);
    expect(result).toContain('-----BEGIN');
  });

  it('throws GitHubAppAuthError for garbage input', () => {
    expect(() => normalizePrivateKey('not a key')).toThrow(GitHubAppAuthError);
  });
});

describe('mintAppJwt', () => {
  it('produces a 3-segment base64url JWT signed with the private key', () => {
    const jwt = mintAppJwt('12345', TEST_PEM);
    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    }
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(payload.iss).toBe('12345');
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
  });

  it('throws GitHubAppAuthError for an unusable private key', () => {
    expect(() => mintAppJwt('1', 'not-a-key')).toThrow(GitHubAppAuthError);
  });
});

describe('createGitHubAppTokenProvider', () => {
  function makeProvider(fetchFn: typeof fetch, overrides: { installationId?: string } = {}) {
    return createGitHubAppTokenProvider({
      appId: '12345',
      privateKey: TEST_PEM,
      owner: 'stordco',
      repo: 'claude-ai-marketplace',
      installationId: overrides.installationId,
      fetchFn,
    });
  }

  it('mints a token via installation discovery + access_tokens', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const fetchFn = jest.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.endsWith('/installation')) return response({ id: 99 });
      if (u.endsWith('/access_tokens')) return response({ token: 'ghs_t1', expires_at: expiresAt });
      return response({ message: 'not found' }, 404);
    });
    const getToken = makeProvider(fetchFn as unknown as typeof fetch);
    expect(await getToken()).toBe('ghs_t1');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns cached token on subsequent calls until expiry', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const fetchFn = jest.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.endsWith('/installation')) return response({ id: 99 });
      if (u.endsWith('/access_tokens')) return response({ token: 'ghs_t1', expires_at: expiresAt });
      return response({}, 404);
    });
    const getToken = makeProvider(fetchFn as unknown as typeof fetch);
    await getToken();
    await getToken();
    await getToken();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('skips installation discovery when installationId is provided', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const fetchFn = jest.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.endsWith('/access_tokens'))
        return response({ token: 'ghs_pinned', expires_at: expiresAt });
      return response({}, 404);
    });
    const getToken = makeProvider(fetchFn as unknown as typeof fetch, { installationId: '77' });
    expect(await getToken()).toBe('ghs_pinned');
    const calls = (fetchFn as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes('/app/installations/77/access_tokens'))).toBe(true);
    // Installation-discovery endpoint (`/repos/.../installation`) should be skipped
    // when an explicit installationId is provided.
    expect(calls.some((u) => /\/repos\/[^/]+\/[^/]+\/installation$/.test(u))).toBe(false);
  });

  it('re-mints when the cached token is past its refresh window', async () => {
    // First mint: token expiring within the 5-minute refresh skew → immediately stale.
    const nearExpiry = new Date(Date.now() + 60_000).toISOString();
    const farExpiry = new Date(Date.now() + 60 * 60_000).toISOString();
    let calls = 0;
    const fetchFn = jest.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.endsWith('/installation')) return response({ id: 99 });
      if (u.endsWith('/access_tokens')) {
        calls += 1;
        return response({
          token: calls === 1 ? 'ghs_stale' : 'ghs_fresh',
          expires_at: calls === 1 ? nearExpiry : farExpiry,
        });
      }
      return response({}, 404);
    });
    const getToken = makeProvider(fetchFn as unknown as typeof fetch);
    expect(await getToken()).toBe('ghs_stale');
    expect(await getToken()).toBe('ghs_fresh');
  });

  it('throws GitHubAppAuthError with status on 401 from installation lookup', async () => {
    const fetchFn = jest.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.endsWith('/installation')) return response({ message: 'Bad credentials' }, 401);
      return response({}, 404);
    });
    const getToken = makeProvider(fetchFn as unknown as typeof fetch);
    await expect(getToken()).rejects.toMatchObject({
      name: 'GitHubAppAuthError',
      status: 401,
    });
  });

  it('throws GitHubAppAuthError on missing expires_at (would otherwise poison the cache)', async () => {
    const fetchFn = jest.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.endsWith('/installation')) return response({ id: 99 });
      if (u.endsWith('/access_tokens'))
        return response({ token: 'ghs_t1', expires_at: 'not-a-date' });
      return response({}, 404);
    });
    const getToken = makeProvider(fetchFn as unknown as typeof fetch);
    await expect(getToken()).rejects.toThrow(GitHubAppAuthError);
  });

  it('does not cache failed mints (next call retries)', async () => {
    let calls = 0;
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const fetchFn = jest.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.endsWith('/installation')) return response({ id: 99 });
      if (u.endsWith('/access_tokens')) {
        calls += 1;
        if (calls === 1) return response({ message: 'rate limited' }, 429);
        return response({ token: 'ghs_recovered', expires_at: expiresAt });
      }
      return response({}, 404);
    });
    const getToken = makeProvider(fetchFn as unknown as typeof fetch);
    await expect(getToken()).rejects.toThrow(GitHubAppAuthError);
    expect(await getToken()).toBe('ghs_recovered');
  });
});

describe('appAuthErrorMessage', () => {
  it('names the App credential for 401/403', () => {
    const err = new GitHubAppAuthError('boom', 401);
    expect(appAuthErrorMessage(err, 'stordco', 'claude-ai-marketplace')).toMatch(
      /App credential.*rejected/i,
    );
  });

  it('names the installation gap for 404', () => {
    const err = new GitHubAppAuthError('boom', 404);
    expect(appAuthErrorMessage(err, 'stordco', 'claude-ai-marketplace')).toMatch(
      /not be installed on stordco\/claude-ai-marketplace/i,
    );
  });

  it('falls back to a generic config message for other statuses', () => {
    const err = new GitHubAppAuthError('boom', 500);
    expect(appAuthErrorMessage(err, 'a', 'b')).toMatch(/misconfigured/i);
  });
});
