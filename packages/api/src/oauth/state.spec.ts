import express from 'express';
import request from 'supertest';
import { logger } from '@librechat/data-schemas';
import { DEFAULT_OAUTH_STATE_TTL_MS } from 'librechat-data-provider';
import type { Request } from 'express';
import type { OAuthStateStore, OAuthStateStoreOptions, PresetStateStrategy } from './state';
import { createOAuthStateStore, deferStateToStore } from './state';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

interface VerifyResult {
  ok: boolean;
  message?: string;
}

/** Mounts the store the way passport-oauth2 drives it: `store` on start, `verify` on callback. */
function createApp(options: OAuthStateStoreOptions) {
  const stateStore: OAuthStateStore = createOAuthStateStore(options);
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use((req, _res, next) => {
    const pairs = (req.get('cookie') ?? '').split(';').map((pair) => pair.trim().split('='));
    req.cookies = Object.fromEntries(pairs.filter(([name]) => name));
    next();
  });
  app.get('/start', (req, res, next) => {
    stateStore.store(req, (err, state) => (err ? next(err) : res.json({ state })));
  });
  const verify = (req: Request, res: express.Response, next: express.NextFunction) => {
    const providedState = req.query.state ?? req.body?.state;
    stateStore.verify(req, providedState, (err, ok, info) =>
      err ? next(err) : res.json({ ok, message: info?.message } satisfies VerifyResult),
    );
  };
  app.get('/oauth/github/callback', verify);
  app.post('/oauth/apple/callback', verify);
  return { app, stateStore };
}

function getSetCookie(response: request.Response, name: string): string | undefined {
  const headers = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return headers.find((header) => header.startsWith(`${name}=`));
}

function cookieValue(header: string | undefined): string {
  return decodeURIComponent(header?.split(';')[0].split('=')[1] ?? '');
}

async function start(app: express.Express, cookieName: string, binding?: string) {
  const req = request(app).get('/start');
  const response = await (binding ? req.set('Cookie', `${cookieName}=${binding}`) : req).expect(
    200,
  );
  return {
    state: response.body.state as string,
    binding: cookieValue(getSetCookie(response, cookieName)),
    response,
  };
}

function callback(app: express.Express, cookie: string | undefined, state: string) {
  const req = request(app).get('/oauth/github/callback').query({ state });
  return (cookie ? req.set('Cookie', cookie) : req).expect(200);
}

const SECRET = 'state-signing-secret';
const PLAIN = 'oauth_state_github';
const github: OAuthStateStoreOptions = { provider: 'github', secret: SECRET, secureCookie: false };
const apple: OAuthStateStoreOptions = {
  provider: 'apple',
  secret: SECRET,
  secureCookie: false,
  crossSiteCallback: true,
};

describe('createOAuthStateStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issues a host-only SameSite=Lax binding cookie on insecure deployments', async () => {
    const { app } = createApp(github);

    const { state, binding, response } = await start(app, PLAIN);
    const cookie = getSetCookie(response, PLAIN);

    expect(binding).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(state).toMatch(/^[0-9a-z]+\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(state).not.toContain(binding);
    expect(cookie).toContain(`Max-Age=${DEFAULT_OAUTH_STATE_TTL_MS / 1000}`);
    expect(cookie).toContain('Path=/;');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Domain=');
  });

  it('uses a __Host- cookie, which a sibling subdomain cannot set, on secure deployments', async () => {
    const { app } = createApp({ ...github, secureCookie: true, maxAgeMs: 120_000 });

    const { response } = await start(app, '__Host-oauth_state_github');
    const cookie = getSetCookie(response, '__Host-oauth_state_github');

    expect(cookie).toContain('Max-Age=120');
    expect(cookie).toContain('Path=/;');
    expect(cookie).toContain('Secure');
    expect(getSetCookie(response, PLAIN)).toBeUndefined();
  });

  it('ignores a plain-named binding on secure deployments', async () => {
    const { app } = createApp({ ...github, secureCookie: true });
    const { state, binding } = await start(app, '__Host-oauth_state_github');

    const response = await callback(app, `${PLAIN}=${binding}`, state);

    expect(response.body).toEqual({
      ok: false,
      message: 'Unable to verify authorization request state.',
    });
  });

  it('marks a cross-site callback cookie SameSite=None and Secure, even on insecure deployments', async () => {
    const { app } = createApp(apple);

    const { response } = await start(app, '__Host-oauth_state_apple');
    const cookie = getSetCookie(response, '__Host-oauth_state_apple');

    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
  });

  it('accepts a state signed for this browser without rewriting the binding', async () => {
    const { app } = createApp(apple);
    const { state, binding } = await start(app, '__Host-oauth_state_apple');

    const response = await request(app)
      .post('/oauth/apple/callback')
      .set('Cookie', `__Host-oauth_state_apple=${binding}`)
      .type('form')
      .send({ state })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('reuses the binding, so logins started in several tabs all complete', async () => {
    const { app } = createApp(github);
    const first = await start(app, PLAIN);
    const second = await start(app, PLAIN, first.binding);
    const third = await start(app, PLAIN, second.binding);

    expect(new Set([first.binding, second.binding, third.binding]).size).toBe(1);
    expect(new Set([first.state, second.state, third.state]).size).toBe(3);

    for (const { state } of [second, first, third]) {
      const response = await callback(app, `${PLAIN}=${third.binding}`, state);
      expect(response.body).toEqual({ ok: true });
    }
  });

  it('rejects a state signed for a different browser', async () => {
    const { app } = createApp(github);
    const otherBrowser = await start(app, PLAIN);
    const thisBrowser = await start(app, PLAIN);

    const response = await callback(app, `${PLAIN}=${thisBrowser.binding}`, otherBrowser.state);

    expect(response.body).toEqual({ ok: false, message: 'Invalid authorization request state.' });
    expect(logger.warn).toHaveBeenCalledWith(
      '[OAuth] Rejected github callback: Invalid authorization request state.',
      { provider: 'github', has_state: true },
    );
  });

  it.each<[string, OAuthStateStoreOptions, string]>([
    ['another provider', { ...github, provider: 'google' }, 'oauth_state_google'],
    ['another secret', { ...github, secret: 'rotated-secret' }, PLAIN],
  ])('rejects a state signed for %s', async (_label, signerOptions, signerCookie) => {
    const { app: signer } = createApp(signerOptions);
    const { app } = createApp(github);
    const { state, binding } = await start(signer, signerCookie);

    const response = await callback(app, `${PLAIN}=${binding}`, state);

    expect(response.body).toEqual({ ok: false, message: 'Invalid authorization request state.' });
  });

  it('expires each state on its own clock while newer flows keep the binding alive', async () => {
    const issuedAt = 1_800_000_000_000;
    const now = jest.spyOn(Date, 'now').mockReturnValue(issuedAt);
    try {
      const { app } = createApp({ ...github, maxAgeMs: 60_000 });
      const older = await start(app, PLAIN);
      now.mockReturnValue(issuedAt + 50_000);
      const newer = await start(app, PLAIN, older.binding);

      now.mockReturnValue(issuedAt + 59_999);
      const justInTime = await callback(app, `${PLAIN}=${newer.binding}`, older.state);
      now.mockReturnValue(issuedAt + 60_000);
      const expired = await callback(app, `${PLAIN}=${newer.binding}`, older.state);
      const current = await callback(app, `${PLAIN}=${newer.binding}`, newer.state);

      expect(justInTime.body).toEqual({ ok: true });
      expect(expired.body).toEqual({ ok: false, message: 'Authorization request state expired.' });
      expect(current.body).toEqual({ ok: true });
    } finally {
      now.mockRestore();
    }
  });

  it('rejects a state whose issue time was changed', async () => {
    const { app } = createApp(github);
    const { state, binding } = await start(app, PLAIN);
    const [, nonce, signature] = state.split('.');
    const retimed = `${(Date.now() + 3_600_000).toString(36)}.${nonce}.${signature}`;

    const response = await callback(app, `${PLAIN}=${binding}`, retimed);

    expect(response.body).toEqual({ ok: false, message: 'Invalid authorization request state.' });
  });

  it.each<[string, (state: string) => string]>([
    ['a truncated signature', (state) => state.slice(0, -1)],
    ['a repeated state parameter', (state) => `${state}&state=${state}`],
    ['an empty state', () => ''],
    ['a bare random value', () => 'b'.repeat(43)],
  ])('rejects %s', async (_label, buildState) => {
    const { app } = createApp(github);
    const { state, binding } = await start(app, PLAIN);

    const response = await request(app)
      .get(`/oauth/github/callback?state=${buildState(state)}`)
      .set('Cookie', `${PLAIN}=${binding}`)
      .expect(200);

    expect(response.body).toEqual({ ok: false, message: 'Invalid authorization request state.' });
  });

  it('rejects a callback when this browser holds no binding cookie', async () => {
    const { app } = createApp(github);
    const { state } = await start(app, PLAIN);

    const response = await callback(app, undefined, state);

    expect(response.body).toEqual({
      ok: false,
      message: 'Unable to verify authorization request state.',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      '[OAuth] Rejected github callback: Unable to verify authorization request state.',
      { provider: 'github', has_state: true },
    );
  });

  it('fails the authorization request when no response is attached to the request', () => {
    const { stateStore } = createApp(github);
    const done = jest.fn();

    stateStore.store({} as Request, done);

    expect(done).toHaveBeenCalledWith(expect.any(Error));
  });

  it('refuses to build a store without a signing secret', () => {
    expect(() => createOAuthStateStore({ ...github, secret: '' })).toThrow(
      'A secret is required to sign github OAuth state',
    );
  });

  it('keeps the arities passport-oauth2 dispatches on', () => {
    const stateStore = createOAuthStateStore(github);

    expect(stateStore.store).toHaveLength(2);
    expect(stateStore.verify).toHaveLength(3);
  });
});

describe('deferStateToStore', () => {
  it('drops a state the strategy fills in without mutating the caller options', () => {
    const strategy: PresetStateStrategy = {
      authorizationParams(options: { state?: string; scope?: string }) {
        options.state = options.state || 'preset-state';
        options.scope = 'name email';
        return options;
      },
    };
    const routeOptions = { session: false };

    deferStateToStore(strategy);
    const params = strategy.authorizationParams(routeOptions);

    expect(params).toEqual({ session: false, scope: 'name email' });
    expect(routeOptions).toEqual({ session: false });
  });
});
