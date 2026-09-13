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
  const callback = (req: Request, res: express.Response, next: express.NextFunction) => {
    const providedState = req.query.state ?? req.body?.state;
    stateStore.verify(req, providedState, (err, ok, info) =>
      err ? next(err) : res.json({ ok, message: info?.message } satisfies VerifyResult),
    );
  };
  app.get('/oauth/github/callback', callback);
  app.post('/oauth/apple/callback', callback);
  return { app, stateStore };
}

function getSetCookie(response: request.Response, name: string): string | undefined {
  const headers = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return headers.find((header) => header.startsWith(`${name}=`));
}

function cookieValue(header: string | undefined): string {
  return header?.split(';')[0].split('=')[1] ?? '';
}

async function start(app: express.Express, cookie?: string) {
  const req = request(app).get('/start');
  const response = await (cookie ? req.set('Cookie', cookie) : req).expect(200);
  return { state: response.body.state as string, response };
}

const github: OAuthStateStoreOptions = { provider: 'github', secureCookie: false };
const secureGithub: OAuthStateStoreOptions = { provider: 'github', secureCookie: true };

describe('createOAuthStateStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issues a host-only SameSite=Lax cookie on insecure deployments', async () => {
    const { app } = createApp(github);

    const { state, response } = await start(app);
    const cookie = getSetCookie(response, 'oauth_state_github');

    expect(cookie).toContain(`oauth_state_github=${state}`);
    expect(cookie).toContain(`Max-Age=${DEFAULT_OAUTH_STATE_TTL_MS / 1000}`);
    expect(cookie).toContain('Path=/;');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
    expect(cookie).not.toContain('Domain=');
  });

  it('uses a __Host- cookie, which a sibling subdomain cannot set, on secure deployments', async () => {
    const { app } = createApp({ ...secureGithub, maxAgeMs: 120_000 });

    const { state, response } = await start(app);
    const cookie = getSetCookie(response, '__Host-oauth_state_github');

    expect(cookie).toContain(`__Host-oauth_state_github=${state}`);
    expect(cookie).toContain('Max-Age=120');
    expect(cookie).toContain('Path=/;');
    expect(cookie).toContain('Secure');
    expect(getSetCookie(response, 'oauth_state_github')).toBeUndefined();
  });

  it('ignores a plain-named cookie on secure deployments', async () => {
    const { app } = createApp(secureGithub);
    const { state } = await start(app);

    const response = await request(app)
      .get('/oauth/github/callback')
      .set('Cookie', `oauth_state_github=${state}`)
      .query({ state })
      .expect(200);

    expect(response.body).toEqual({
      ok: false,
      message: 'Unable to verify authorization request state.',
    });
  });

  it('marks a cross-site callback cookie SameSite=None and Secure, even on insecure deployments', async () => {
    const { app } = createApp({ provider: 'apple', secureCookie: false, crossSiteCallback: true });

    const { response } = await start(app);
    const cookie = getSetCookie(response, '__Host-oauth_state_apple');

    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
  });

  it('accepts the state issued to this browser and clears the cookie with matching attributes', async () => {
    const { app } = createApp({ provider: 'apple', secureCookie: true, crossSiteCallback: true });
    const { state } = await start(app);

    const response = await request(app)
      .post('/oauth/apple/callback')
      .set('Cookie', `__Host-oauth_state_apple=${state}`)
      .type('form')
      .send({ state })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    const cleared = getSetCookie(response, '__Host-oauth_state_apple');
    expect(cleared).toContain('__Host-oauth_state_apple=;');
    expect(cleared).toContain('Path=/;');
    expect(cleared).toContain('SameSite=None');
    expect(cleared).toContain('Secure');
  });

  it('keeps flows started in other tabs pending and consumes only the matched one', async () => {
    const { app } = createApp(github);
    const first = await start(app);
    const second = await start(
      app,
      `oauth_state_github=${cookieValue(getSetCookie(first.response, 'oauth_state_github'))}`,
    );
    const pending = cookieValue(getSetCookie(second.response, 'oauth_state_github'));

    expect(pending.split('.')).toEqual([second.state, first.state]);

    const firstCallback = await request(app)
      .get('/oauth/github/callback')
      .set('Cookie', `oauth_state_github=${pending}`)
      .query({ state: first.state })
      .expect(200);

    expect(firstCallback.body).toEqual({ ok: true });
    const remaining = cookieValue(getSetCookie(firstCallback, 'oauth_state_github'));
    expect(remaining).toBe(second.state);

    const secondCallback = await request(app)
      .get('/oauth/github/callback')
      .set('Cookie', `oauth_state_github=${remaining}`)
      .query({ state: second.state })
      .expect(200);

    expect(secondCallback.body).toEqual({ ok: true });
    expect(getSetCookie(secondCallback, 'oauth_state_github')).toContain('oauth_state_github=;');
  });

  it('remembers at most three outstanding flows, dropping the oldest', async () => {
    const { app } = createApp(github);
    let cookie = '';
    const states: string[] = [];
    for (let i = 0; i < 4; i++) {
      const flow = await start(app, cookie ? `oauth_state_github=${cookie}` : undefined);
      states.push(flow.state);
      cookie = cookieValue(getSetCookie(flow.response, 'oauth_state_github'));
    }

    expect(cookie.split('.')).toEqual([states[3], states[2], states[1]]);
  });

  it.each<[string, (state: string) => string]>([
    ['a different state', () => 'b'.repeat(43)],
    ['a state of another length', (state) => `${state}x`],
    ['a repeated state parameter', (state) => `${state}&state=${state}`],
    ['an empty state', () => ''],
  ])('rejects %s without discarding the pending state', async (_label, buildState) => {
    const { app } = createApp(github);
    const { state } = await start(app);

    const response = await request(app)
      .get(`/oauth/github/callback?state=${buildState(state)}`)
      .set('Cookie', `oauth_state_github=${state}`)
      .expect(200);

    expect(response.body).toEqual({ ok: false, message: 'Invalid authorization request state.' });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      '[OAuth] Rejected github callback: Invalid authorization request state.',
      expect.objectContaining({ provider: 'github' }),
    );
  });

  it('rejects a callback when this browser holds no state cookie', async () => {
    const { app } = createApp(github);
    const { state } = await start(app);

    const response = await request(app).get('/oauth/github/callback').query({ state }).expect(200);

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
    const callback = jest.fn();

    stateStore.store({} as Request, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
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
