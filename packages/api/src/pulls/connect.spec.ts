import { getTenantId, tenantStorage } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { PullRequestOAuth, PullRequestOAuthState } from './oauth';
import type { ServerRequest } from '~/types';
import {
  createPullRequestUserToken,
  createPullRequestConnectionRouter,
  createPullRequestConnectionHandlers,
} from './connect';
import { generateOAuthCsrfToken, OAUTH_CSRF_COOKIE, OAUTH_SESSION_COOKIE } from '~/oauth/csrf';

const env = {
  JWT_SECRET: 'jwt-secret',
  GH_CLIENT_ID: 'client-1',
  GH_CLIENT_SECRET: 'client-secret',
};
const oauthSettings = {
  allowedRepositories: ['o/r'],
  oauth: { clientId: '${GH_CLIENT_ID}', clientSecret: '${GH_CLIENT_SECRET}' },
};
const configWith = (pullRequests?: Record<string, unknown>) => ({
  endpoints: { agents: { pullRequests } },
});
const claims: PullRequestOAuthState = {
  userId: 'u1',
  provider: 'github',
  host: 'github.com',
  nonce: 'n',
  flowId: 'pull-request-oauth:u1:n',
};

function makeOAuth(overrides: Partial<PullRequestOAuth> = {}): jest.Mocked<PullRequestOAuth> {
  return {
    authorizationUrl: jest.fn(() => ({
      url: 'https://github.com/login/oauth/authorize?x=1',
      flowId: claims.flowId,
    })),
    verifyState: jest.fn(() => claims),
    complete: jest.fn(async () => undefined),
    token: jest.fn(async () => 'user-token'),
    connected: jest.fn(async () => true),
    disconnect: jest.fn(async () => undefined),
    ...overrides,
  } as jest.Mocked<PullRequestOAuth>;
}

function setup({
  settings = oauthSettings,
  base = settings,
  oauth = makeOAuth(),
}: {
  settings?: Record<string, unknown> | undefined;
  base?: Record<string, unknown> | undefined;
  oauth?: jest.Mocked<PullRequestOAuth>;
} = {}) {
  const getAppConfig = jest
    .fn()
    .mockImplementation(async (options: { baseOnly?: boolean }) =>
      configWith(options.baseOnly ? base : settings),
    );
  const handlers = createPullRequestConnectionHandlers({ oauth, getAppConfig, env });
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };
  return { handlers, oauth, getAppConfig, res };
}

const asRes = (res: unknown) => res as Response;
const signedIn = (user: Record<string, unknown> | null = { id: 'u1' }) =>
  ({ user, params: {}, query: {} }) as unknown as ServerRequest;
const callbackRequest = (query: Record<string, string>, cookies: Record<string, string> = {}) =>
  ({ query, cookies }) as unknown as Request;
const bound = () => ({
  [OAUTH_CSRF_COOKIE]: generateOAuthCsrfToken(claims.flowId, env.JWT_SECRET),
});

beforeAll(() => {
  process.env.JWT_SECRET = env.JWT_SECRET;
});

describe('connect', () => {
  it('answers the provider page and binds the flow to this browser with a cookie', async () => {
    const { handlers, oauth, res } = setup();
    await handlers.connect(signedIn(), asRes(res));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ url: 'https://github.com/login/oauth/authorize?x=1' });
    expect(oauth.authorizationUrl).toHaveBeenCalledWith(
      { id: 'u1' },
      expect.objectContaining({ provider: 'github', clientId: 'client-1' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      OAUTH_CSRF_COOKIE,
      generateOAuthCsrfToken(claims.flowId, env.JWT_SECRET),
      expect.objectContaining({ httpOnly: true, path: '/api/pull-requests/oauth/callback' }),
    );
  });

  it('is unavailable when no app is configured', async () => {
    const { handlers, res } = setup({ settings: { allowedRepositories: ['o/r'] } });
    await handlers.connect(signedIn(), asRes(res));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NOT_CONFIGURED' }));
  });

  it('answers a failure with a stable code, never the cause', async () => {
    const { handlers, res } = setup({
      oauth: makeOAuth({
        authorizationUrl: jest.fn(() => {
          throw new Error('mongodb://secret@host');
        }),
      }),
    });
    await handlers.connect(signedIn(), asRes(res));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CONNECT_FAILED' }));
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret@host');
  });

  it('takes the app from the operator config, never from a database override', async () => {
    const { handlers, res } = setup({
      settings: { ...oauthSettings, oauth: { clientId: '${EVIL_ID}', clientSecret: '${EVIL}' } },
      base: { allowedRepositories: ['o/r'] },
    });
    await handlers.connect(signedIn(), asRes(res));
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('refuses a request without a user', async () => {
    const { handlers, res } = setup();
    await handlers.connect(signedIn(null), asRes(res));
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('callback', () => {
  const run = async (
    query: Record<string, string>,
    cookies: Record<string, string> = bound(),
    options: Parameters<typeof setup>[0] = {},
  ) => {
    const context = setup(options);
    await context.handlers.callback(callbackRequest(query, cookies), asRes(context.res));
    return context;
  };

  it('stores the grant and shows the success page', async () => {
    const { oauth, res } = await run({ state: 's', code: 'c' });
    expect(oauth.complete).toHaveBeenCalledWith(
      claims,
      'c',
      expect.objectContaining({ provider: 'github', host: 'github.com' }),
    );
    expect(res.redirect).toHaveBeenCalledWith('/oauth/success?serverName=GitHub');
  });

  it('accepts the session cookie of the same user when the flow cookie is gone', async () => {
    const { oauth, res } = await run(
      { state: 's', code: 'c' },
      { [OAUTH_SESSION_COOKIE]: generateOAuthCsrfToken('u1', env.JWT_SECRET) },
    );
    expect(oauth.complete).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/oauth/success?serverName=GitHub');
  });

  it.each([
    ['no state', { code: 'c' }, bound(), 'missing_state'],
    ['no code', { state: 's' }, bound(), 'missing_code'],
    ['a browser that did not start the flow', { state: 's', code: 'c' }, {}, 'invalid_state'],
    [
      "another user's session",
      { state: 's', code: 'c' },
      { [OAUTH_SESSION_COOKIE]: generateOAuthCsrfToken('u2', env.JWT_SECRET) },
      'invalid_state',
    ],
    ['a refusal by the user', { state: 's', error: 'access_denied' }, bound(), 'callback_failed'],
  ])('fails for %s, storing nothing', async (_label, query, cookies, code) => {
    const { oauth, res } = await run(query, cookies);
    expect(oauth.complete).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(`/oauth/error?error=${code}`);
  });

  it('fails for a state this server did not issue', async () => {
    const { oauth, res } = await run({ state: 's', code: 'c' }, bound(), {
      oauth: makeOAuth({ verifyState: jest.fn(() => null) }),
    });
    expect(oauth.complete).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/oauth/error?error=invalid_state');
  });

  it('fails for a flow started on a host the operator no longer configures', async () => {
    const { oauth, res } = await run({ state: 's', code: 'c' }, bound(), {
      base: { ...oauthSettings, host: 'ghe.example.com' },
    });
    expect(oauth.complete).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/oauth/error?error=invalid_state');
  });

  it('fails without provider text when the exchange fails', async () => {
    const { res } = await run({ state: 's', code: 'c' }, bound(), {
      oauth: makeOAuth({ complete: jest.fn().mockRejectedValue(new Error('secret detail')) }),
    });
    expect(res.redirect).toHaveBeenCalledWith('/oauth/error?error=callback_failed');
  });

  it('refuses a callback already placed in another tenant than the flow started in', async () => {
    const oauth = makeOAuth({ verifyState: jest.fn(() => ({ ...claims, tenantId: 'tenant-a' })) });
    const context = setup({ oauth });
    await tenantStorage.run({ tenantId: 'tenant-b' }, () =>
      context.handlers.callback(
        callbackRequest({ state: 's', code: 'c' }, bound()),
        asRes(context.res),
      ),
    );
    expect(oauth.complete).not.toHaveBeenCalled();
    expect(context.res.redirect).toHaveBeenCalledWith('/oauth/error?error=invalid_state');
  });

  it('restores the tenant the flow started in before storing', async () => {
    let tenantDuringComplete: string | undefined;
    const oauth = makeOAuth({
      verifyState: jest.fn(() => ({ ...claims, tenantId: 'tenant-a' })),
      complete: jest.fn(async () => {
        tenantDuringComplete = getTenantId();
      }),
    });
    const { getAppConfig } = await run({ state: 's', code: 'c' }, bound(), { oauth });
    expect(tenantDuringComplete).toBe('tenant-a');
    expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true, tenantId: 'tenant-a' });
  });
});

describe('status and disconnect', () => {
  it('reports a connected account', async () => {
    const { handlers, res } = setup();
    await handlers.status(signedIn(), asRes(res));
    expect(res.json).toHaveBeenCalledWith({
      configured: true,
      provider: 'github',
      connected: true,
    });
  });

  it('reports a deployment where users cannot connect', async () => {
    const { handlers, oauth, res } = setup({ settings: { allowedRepositories: ['o/r'] } });
    await handlers.status(signedIn(), asRes(res));
    expect(res.json).toHaveBeenCalledWith({ configured: false, connected: false });
    expect(oauth.connected).not.toHaveBeenCalled();
  });

  it('removes the connection', async () => {
    const { handlers, oauth, res } = setup();
    await handlers.disconnect(signedIn(), asRes(res));
    expect(oauth.disconnect).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('removes the connection after the app was turned off', async () => {
    const { handlers, oauth, res } = setup({ settings: { allowedRepositories: ['o/r'] } });
    await handlers.disconnect(signedIn(), asRes(res));
    expect(oauth.disconnect).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('answers a status or disconnect failure with a stable code', async () => {
    const failing = makeOAuth({
      connected: jest.fn(async () => {
        throw new Error('key unavailable');
      }),
      disconnect: jest.fn(async () => {
        throw new Error('db down');
      }),
    });
    const { handlers, res } = setup({ oauth: failing });
    await handlers.status(signedIn(), asRes(res));
    expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'STATUS_FAILED' }));
    await handlers.disconnect(signedIn(), asRes(res));
    expect(res.json).toHaveBeenLastCalledWith(
      expect.objectContaining({ code: 'DISCONNECT_FAILED' }),
    );
  });
});

describe('createPullRequestConnectionRouter', () => {
  const routesOf = (router: { stack: Array<{ route?: { path: string; methods: object } }> }) =>
    router.stack.flatMap((layer) =>
      layer.route ? Object.keys(layer.route.methods).map((m) => `${m} ${layer.route!.path}`) : [],
    );
  const deps = {
    store: { findToken: jest.fn(), replaceTokenIfCurrent: jest.fn(), deleteTokens: jest.fn() },
    fetchFn: jest.fn(),
    getAppConfig: jest.fn(),
    requireJwtAuth: jest.fn(),
  };

  it('registers the connection routes when states can be signed', () => {
    const router = createPullRequestConnectionRouter({ ...deps, env });
    expect(routesOf(router as never)).toEqual([
      'get /oauth/callback',
      'get /oauth/connect',
      'get /oauth/status',
      'delete /oauth',
    ]);
  });

  it('registers nothing without a signing secret', () => {
    const router = createPullRequestConnectionRouter({ ...deps, env: {} });
    expect(routesOf(router as never)).toEqual([]);
  });
});

describe('createPullRequestUserToken', () => {
  it('reads the token only when an app is configured', async () => {
    const oauth = makeOAuth();
    const userToken = createPullRequestUserToken(oauth, env);
    await expect(userToken('u1', oauthSettings)).resolves.toBe('user-token');
    await expect(userToken('u1', { allowedRepositories: ['o/r'] })).resolves.toBeNull();
    expect(oauth.token).toHaveBeenCalledTimes(1);
  });
});
