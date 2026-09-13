import express from 'express';
import request from 'supertest';
import { logger } from '@librechat/data-schemas';
import type { Request } from 'express';
import type { OAuthStateStore, OAuthStateStoreOptions } from './state';
import { createOAuthStateStore, OAUTH_STATE_MAX_AGE } from './state';

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

function getCookie(response: request.Response, name: string): string | undefined {
  const headers = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return headers.find((header) => header.startsWith(`${name}=`));
}

describe('createOAuthStateStore', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: 'test', DOMAIN_SERVER: 'http://localhost:3080' };
    delete process.env.SESSION_COOKIE_SECURE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('issues a SameSite=Lax cookie scoped to the callback path that follows the session Secure setting', async () => {
    process.env.SESSION_COOKIE_SECURE = 'true';
    const { app } = createApp({
      provider: 'github',
      callbackURL: 'https://chat.example.com/oauth/github/callback',
    });

    const response = await request(app).get('/start').expect(200);
    const cookie = getCookie(response, 'oauth_state_github');

    expect(cookie).toContain(`oauth_state_github=${response.body.state}`);
    expect(cookie).toContain(`Max-Age=${OAUTH_STATE_MAX_AGE / 1000}`);
    expect(cookie).toContain('Path=/oauth/github/callback');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
  });

  it('scopes the cookie to the whole site when the callback URL cannot be parsed', async () => {
    const { app } = createApp({ provider: 'github', callbackURL: 'undefined/oauth/callback' });

    const response = await request(app).get('/start').expect(200);

    const cookie = getCookie(response, 'oauth_state_github');
    expect(cookie).toContain('Path=/;');
    expect(cookie).not.toContain('Secure');
  });

  it('marks a cross-site callback cookie SameSite=None and Secure, even on insecure deployments', async () => {
    const { app } = createApp({
      provider: 'apple',
      callbackURL: 'http://localhost:3080/oauth/apple/callback',
      crossSiteCallback: true,
    });

    const response = await request(app).get('/start').expect(200);
    const cookie = getCookie(response, 'oauth_state_apple');

    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
  });

  it('accepts the state issued to this browser and clears it with matching attributes', async () => {
    const { app } = createApp({
      provider: 'apple',
      callbackURL: 'https://chat.example.com/oauth/apple/callback',
      crossSiteCallback: true,
    });
    const start = await request(app).get('/start').expect(200);

    const response = await request(app)
      .post('/oauth/apple/callback')
      .set('Cookie', `oauth_state_apple=${start.body.state}`)
      .type('form')
      .send({ state: start.body.state })
      .expect(200);

    expect(response.body).toEqual({ ok: true });
    const cleared = getCookie(response, 'oauth_state_apple');
    expect(cleared).toContain('oauth_state_apple=;');
    expect(cleared).toContain('Path=/oauth/apple/callback');
    expect(cleared).toContain('SameSite=None');
    expect(cleared).toContain('Secure');
  });

  it.each<[string, (state: string) => string]>([
    ['a different state', () => 'b'.repeat(43)],
    ['a state of another length', (state) => `${state}x`],
    ['a repeated state parameter', (state) => `${state}&state=${state}`],
    ['an empty state', () => ''],
  ])('rejects %s', async (_label, buildState) => {
    const { app } = createApp({
      provider: 'github',
      callbackURL: 'https://chat.example.com/oauth/github/callback',
    });
    const start = await request(app).get('/start').expect(200);
    const state: string = start.body.state;

    const response = await request(app)
      .get(`/oauth/github/callback?state=${buildState(state)}`)
      .set('Cookie', `oauth_state_github=${state}`)
      .expect(200);

    expect(response.body).toEqual({ ok: false, message: 'Invalid authorization request state.' });
    expect(getCookie(response, 'oauth_state_github')).toContain('oauth_state_github=;');
    expect(logger.warn).toHaveBeenCalledWith(
      '[OAuth] Rejected github callback: Invalid authorization request state.',
      expect.objectContaining({ provider: 'github' }),
    );
  });

  it('rejects a callback when this browser holds no state cookie', async () => {
    const { app } = createApp({
      provider: 'github',
      callbackURL: 'https://chat.example.com/oauth/github/callback',
    });
    const start = await request(app).get('/start').expect(200);

    const response = await request(app)
      .get('/oauth/github/callback')
      .query({ state: start.body.state })
      .expect(200);

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
    const { stateStore } = createApp({
      provider: 'github',
      callbackURL: 'https://chat.example.com/oauth/github/callback',
    });
    const callback = jest.fn();

    stateStore.store({} as Request, callback);

    expect(callback).toHaveBeenCalledWith(expect.any(Error));
  });

  it('keeps the arities passport-oauth2 dispatches on', () => {
    const stateStore = createOAuthStateStore({
      provider: 'github',
      callbackURL: 'https://chat.example.com/oauth/github/callback',
    });

    expect(stateStore.store).toHaveLength(2);
    expect(stateStore.verify).toHaveLength(3);
  });
});
