import { Keyv } from 'keyv';

jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }),
  { virtual: true },
);

import { stripCodeChallenge, storeAndStripChallenge, isAdminPanelRedirect } from './exchange';
import type { PkceStrippableRequest } from './exchange';

function makeReq(overrides: Partial<PkceStrippableRequest> = {}): PkceStrippableRequest {
  return { query: {}, originalUrl: '', url: '', ...overrides };
}

describe('stripCodeChallenge', () => {
  const challenge = 'a'.repeat(64);
  const callbackUrl = 'https://admin.example.com/auth/openid/callback';
  const encodedCallbackUrl = 'https%3A%2F%2Fadmin.example.com%2Fauth%2Fopenid%2Fcallback';

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

  it('removes admin-panel-only params before the request reaches Passport', () => {
    const originalUrl =
      `/api/admin/oauth/openid?code_challenge=${challenge}` +
      `&redirect_uri=${encodedCallbackUrl}&redirectTo=%2Fsettings&foo=bar`;
    const url =
      `/oauth/openid?code_challenge=${challenge}` +
      `&redirect_uri=${encodedCallbackUrl}&redirectTo=%2Fsettings&foo=bar`;
    const req = makeReq({
      query: {
        code_challenge: challenge,
        redirect_uri: callbackUrl,
        redirectTo: '/settings',
        foo: 'bar',
      },
      originalUrl,
      url,
    });

    stripCodeChallenge(req);

    expect(req.query.code_challenge).toBeUndefined();
    expect(req.query.redirect_uri).toBeUndefined();
    expect(req.query.redirectTo).toBeUndefined();
    expect(req.query.foo).toBe('bar');
    expect(req.originalUrl).toBe('/api/admin/oauth/openid?foo=bar');
    expect(req.url).toBe('/oauth/openid?foo=bar');
  });

  it('removes redirect_uri when it is the only admin-panel-only param', () => {
    const req = makeReq({
      query: { redirect_uri: callbackUrl },
      originalUrl: `/oauth/openid?redirect_uri=${encodedCallbackUrl}`,
      url: `/oauth/openid?redirect_uri=${encodedCallbackUrl}`,
    });

    stripCodeChallenge(req);

    expect(req.query.redirect_uri).toBeUndefined();
    expect(req.originalUrl).toBe('/oauth/openid');
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
  const callbackUrl = 'https://admin.example.com/auth/openid/callback';
  const encodedCallbackUrl = 'https%3A%2F%2Fadmin.example.com%2Fauth%2Fopenid%2Fcallback';

  it('stores valid challenge in cache and strips from request', async () => {
    const cache = new Keyv();
    const setSpy = jest.spyOn(cache, 'set');
    const url = `/oauth/openid?code_challenge=${challenge}&redirect_uri=${encodedCallbackUrl}`;
    const req = makeReq({
      query: {
        code_challenge: challenge,
        redirect_uri: callbackUrl,
      },
      originalUrl: url,
      url,
    });

    const result = await storeAndStripChallenge(cache, req, 'test-state', 'openid');

    expect(result).toBe(true);
    expect(setSpy).toHaveBeenCalledWith(`pkce:test-state`, challenge, expect.any(Number));
    expect(req.query.code_challenge).toBeUndefined();
    expect(req.query.redirect_uri).toBeUndefined();
    expect(req.originalUrl).toBe('/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });

  it('strips and returns true when no code_challenge is present', async () => {
    const cache = new Keyv();
    const setSpy = jest.spyOn(cache, 'set');
    const req = makeReq({
      query: {},
      originalUrl: '/oauth/openid',
      url: '/oauth/openid',
    });

    const result = await storeAndStripChallenge(cache, req, 'test-state', 'openid');

    expect(result).toBe(true);
    expect(setSpy).not.toHaveBeenCalled();
    expect(req.originalUrl).toBe('/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });

  it('strips and returns true when code_challenge is invalid (not 64 hex)', async () => {
    const cache = new Keyv();
    const setSpy = jest.spyOn(cache, 'set');
    const url = `/oauth/openid?code_challenge=too-short&redirect_uri=${encodedCallbackUrl}`;
    const req = makeReq({
      query: {
        code_challenge: 'too-short',
        redirect_uri: callbackUrl,
      },
      originalUrl: url,
      url,
    });

    const result = await storeAndStripChallenge(cache, req, 'test-state', 'openid');

    expect(result).toBe(true);
    expect(setSpy).not.toHaveBeenCalled();
    expect(req.query.code_challenge).toBeUndefined();
    expect(req.query.redirect_uri).toBeUndefined();
    expect(req.originalUrl).toBe('/oauth/openid');
    expect(req.url).toBe('/oauth/openid');
  });

  it('returns false and does not strip on cache failure', async () => {
    const cache = new Keyv();
    jest.spyOn(cache, 'set').mockRejectedValueOnce(new Error('cache down'));
    const url = `/oauth/openid?code_challenge=${challenge}&redirect_uri=${encodedCallbackUrl}`;
    const req = makeReq({
      query: {
        code_challenge: challenge,
        redirect_uri: callbackUrl,
      },
      originalUrl: url,
      url,
    });

    const result = await storeAndStripChallenge(cache, req, 'test-state', 'openid');

    expect(result).toBe(false);
    expect(req.query.code_challenge).toBe(challenge);
    expect(req.query.redirect_uri).toBe(callbackUrl);
    expect(req.originalUrl).toBe(url);
    expect(req.url).toBe(url);
  });

  it('reads code_challenge before stripping (ordering guarantee)', async () => {
    const cache = new Keyv();
    const setSpy = jest.spyOn(cache, 'set');
    const req = makeReq({
      query: { code_challenge: challenge },
      originalUrl: `/oauth/openid?code_challenge=${challenge}`,
      url: `/oauth/openid?code_challenge=${challenge}`,
    });

    await storeAndStripChallenge(cache, req, 'test-state', 'openid');

    const storedValue = setSpy.mock.calls[0][1];
    expect(storedValue).toBe(challenge);
  });
});

describe('isAdminPanelRedirect', () => {
  const crossOriginAdmin = 'http://localhost:3000';
  const crossOriginClient = 'http://localhost:3080';
  const sameOriginAdmin = 'https://example.com/admin';
  const sameOriginClient = 'https://example.com';

  describe('same-origin deployment (admin behind path prefix)', () => {
    it('returns true for a redirect to the admin callback path', () => {
      expect(
        isAdminPanelRedirect(
          'https://example.com/admin/auth/openid/callback',
          sameOriginAdmin,
          sameOriginClient,
        ),
      ).toBe(true);
    });

    it('returns false for a redirect to the main client', () => {
      expect(
        isAdminPanelRedirect(
          'https://example.com/oauth/openid/callback',
          sameOriginAdmin,
          sameOriginClient,
        ),
      ).toBe(false);
    });

    it('returns false for a redirect to a path that merely starts with the domain but not /admin', () => {
      expect(
        isAdminPanelRedirect('https://example.com/other', sameOriginAdmin, sameOriginClient),
      ).toBe(false);
    });
  });

  describe('cross-origin deployment (admin on different origin)', () => {
    it('returns true when redirect origin matches admin origin but not client origin', () => {
      expect(
        isAdminPanelRedirect(
          'http://localhost:3000/auth/openid/callback',
          crossOriginAdmin,
          crossOriginClient,
        ),
      ).toBe(true);
    });

    it('returns false when redirect origin matches client origin', () => {
      expect(
        isAdminPanelRedirect(
          'http://localhost:3080/oauth/openid/callback',
          crossOriginAdmin,
          crossOriginClient,
        ),
      ).toBe(false);
    });

    it('returns false when redirect origin matches neither', () => {
      expect(
        isAdminPanelRedirect('https://other.com/callback', crossOriginAdmin, crossOriginClient),
      ).toBe(false);
    });
  });
});
