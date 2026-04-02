const { CacheKeys } = require('librechat-data-provider');

jest.mock('~/cache/getLogStores', () => {
  const store = new Map();
  const cache = {
    get: jest.fn((key) => Promise.resolve(store.get(key))),
    set: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve(true);
    }),
    delete: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve(true);
    }),
    _store: store,
  };
  return jest.fn(() => cache);
});

const getLogStores = require('~/cache/getLogStores');
const { stripCodeChallenge, storeAndStripChallenge } = require('~/server/utils/adminPkce');

const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);

function makeReq({ query = {}, originalUrl = '', url = '' } = {}) {
  return { query: { ...query }, originalUrl, url };
}

describe('stripCodeChallenge', () => {
  const challenge = 'a'.repeat(64);

  it('removes code_challenge from req.query and both URL strings (sole param)', () => {
    const req = makeReq({
      query: { code_challenge: challenge },
      originalUrl: `/api/admin/oauth/openid?code_challenge=${challenge}`,
      url: `/oauth/openid?code_challenge=${challenge}`,
    });

    stripCodeChallenge(req);

    expect(req.query.code_challenge).toBeUndefined();
    expect(req.originalUrl).toBe('/api/admin/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });

  it('preserves other params when code_challenge is last', () => {
    const req = makeReq({
      query: { foo: 'bar', code_challenge: challenge },
      originalUrl: `/oauth/openid?foo=bar&code_challenge=${challenge}`,
      url: `/oauth/openid?foo=bar&code_challenge=${challenge}`,
    });

    stripCodeChallenge(req);

    expect(req.query.code_challenge).toBeUndefined();
    expect(req.query.foo).toBe('bar');
    expect(req.originalUrl).toBe('/oauth/openid?foo=bar');
    expect(req.url).toBe('/oauth/openid?foo=bar');
  });

  it('preserves other params when code_challenge is first of multiple', () => {
    const req = makeReq({
      query: { code_challenge: challenge, foo: 'bar' },
      originalUrl: `/oauth/openid?code_challenge=${challenge}&foo=bar`,
      url: `/oauth/openid?code_challenge=${challenge}&foo=bar`,
    });

    stripCodeChallenge(req);

    expect(req.query.code_challenge).toBeUndefined();
    expect(req.originalUrl).toBe('/oauth/openid?foo=bar');
    expect(req.url).toBe('/oauth/openid?foo=bar');
  });

  it('preserves other params when code_challenge is in the middle', () => {
    const req = makeReq({
      query: { a: '1', code_challenge: challenge, b: '2' },
      originalUrl: `/oauth/openid?a=1&code_challenge=${challenge}&b=2`,
      url: `/oauth/openid?a=1&code_challenge=${challenge}&b=2`,
    });

    stripCodeChallenge(req);

    expect(req.query.code_challenge).toBeUndefined();
    expect(req.originalUrl).toBe('/oauth/openid?a=1&b=2');
    expect(req.url).toBe('/oauth/openid?a=1&b=2');
  });

  it('handles empty code_challenge= value', () => {
    const req = makeReq({
      query: { code_challenge: '' },
      originalUrl: '/oauth/openid?code_challenge=',
      url: '/oauth/openid?code_challenge=',
    });

    stripCodeChallenge(req);

    expect(req.query.code_challenge).toBeUndefined();
    expect(req.originalUrl).toBe('/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });

  it('is a no-op when no code_challenge is present', () => {
    const req = makeReq({
      query: { foo: 'bar' },
      originalUrl: '/oauth/openid?foo=bar',
      url: '/oauth/openid?foo=bar',
    });

    stripCodeChallenge(req);

    expect(req.query.foo).toBe('bar');
    expect(req.originalUrl).toBe('/oauth/openid?foo=bar');
    expect(req.url).toBe('/oauth/openid?foo=bar');
  });

  it('is a no-op on a bare path with no query string', () => {
    const req = makeReq({
      query: {},
      originalUrl: '/oauth/openid',
      url: '/oauth/openid',
    });

    stripCodeChallenge(req);

    expect(req.originalUrl).toBe('/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });
});

describe('storeAndStripChallenge', () => {
  const challenge = 'a'.repeat(64);

  beforeEach(() => {
    jest.clearAllMocks();
    cache._store.clear();
  });

  it('stores valid challenge in cache and strips from request', async () => {
    const req = makeReq({
      query: { code_challenge: challenge },
      originalUrl: `/oauth/openid?code_challenge=${challenge}`,
      url: `/oauth/openid?code_challenge=${challenge}`,
    });

    const result = await storeAndStripChallenge(req, 'test-state', 'openid');

    expect(result).toBe(true);
    expect(cache.set).toHaveBeenCalledWith(`pkce:test-state`, challenge, expect.any(Number));
    expect(req.query.code_challenge).toBeUndefined();
    expect(req.originalUrl).toBe('/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });

  it('strips and returns true when no code_challenge is present', async () => {
    const req = makeReq({
      query: {},
      originalUrl: '/oauth/openid',
      url: '/oauth/openid',
    });

    const result = await storeAndStripChallenge(req, 'test-state', 'openid');

    expect(result).toBe(true);
    expect(cache.set).not.toHaveBeenCalled();
    expect(req.originalUrl).toBe('/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });

  it('strips and returns true when code_challenge is invalid (not 64 hex)', async () => {
    const req = makeReq({
      query: { code_challenge: 'too-short' },
      originalUrl: '/oauth/openid?code_challenge=too-short',
      url: '/oauth/openid?code_challenge=too-short',
    });

    const result = await storeAndStripChallenge(req, 'test-state', 'openid');

    expect(result).toBe(true);
    expect(cache.set).not.toHaveBeenCalled();
    expect(req.query.code_challenge).toBeUndefined();
    expect(req.originalUrl).toBe('/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });

  it('returns false and does not strip on cache failure', async () => {
    cache.set.mockRejectedValueOnce(new Error('cache down'));
    const req = makeReq({
      query: { code_challenge: challenge },
      originalUrl: `/oauth/openid?code_challenge=${challenge}`,
      url: `/oauth/openid?code_challenge=${challenge}`,
    });

    const result = await storeAndStripChallenge(req, 'test-state', 'openid');

    expect(result).toBe(false);
    expect(req.query.code_challenge).toBe(challenge);
    expect(req.originalUrl).toContain('code_challenge');
  });

  it('reads code_challenge before stripping (ordering guarantee)', async () => {
    const req = makeReq({
      query: { code_challenge: challenge },
      originalUrl: `/oauth/openid?code_challenge=${challenge}`,
      url: `/oauth/openid?code_challenge=${challenge}`,
    });

    await storeAndStripChallenge(req, 'test-state', 'openid');

    const storedValue = cache.set.mock.calls[0][1];
    expect(storedValue).toBe(challenge);
  });
});
