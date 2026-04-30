import type { AppConfig, IUser, UserMethods } from '@librechat/data-schemas';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import type { JwtPayload, VerifyOptions } from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { RequestInit } from 'undici';

jest.mock('@librechat/data-schemas', () => ({
  getTenantId: jest.fn(),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/utils', () => ({
  isEnabled: jest.fn(() => false),
  math: jest.fn(() => 60000),
}));

const mockGetSigningKey = jest.fn();
const mockGetSigningKeys = jest.fn();

jest.mock('jwks-rsa', () =>
  jest.fn(() => ({ getSigningKey: mockGetSigningKey, getSigningKeys: mockGetSigningKeys })),
);

jest.mock('undici', () => ({
  fetch: jest.fn(),
  ProxyAgent: jest.fn((proxy: string) => ({ proxy })),
}));

jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('../auth/openid', () => {
  const actual = jest.requireActual('../auth/openid') as typeof import('../auth/openid');
  return { ...actual, findOpenIDUser: jest.fn(actual.findOpenIDUser) };
});

import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { logger, getTenantId } from '@librechat/data-schemas';
import { clearRemoteAgentAuthCache, createRemoteAgentAuth } from './remoteAgentAuth';
import { findOpenIDUser } from '../auth/openid';
import { math } from '~/utils';

const mockFetch = undiciFetch as jest.Mock;
const mockProxyAgent = ProxyAgent as unknown as jest.Mock;
const mockGetTenantId = getTenantId as jest.Mock;
const mockMath = math as jest.Mock;
const realFindOpenIDUser =
  jest.requireActual<typeof import('../auth/openid')>('../auth/openid').findOpenIDUser;
const mockFindOpenIDUser = findOpenIDUser as jest.MockedFunction<typeof findOpenIDUser>;
const FAKE_TOKEN = 'header.payload.signature';
const BASE_ISSUER = 'https://auth.example.com/realms/test';
const BASE_JWKS_URI = `${BASE_ISSUER}/protocol/openid-connect/certs`;
const ENV_KEYS = [
  'OPENID_JWKS_URL',
  'OPENID_JWKS_URL_CACHE_ENABLED',
  'OPENID_JWKS_URL_CACHE_TIME',
  'PROXY',
] as const;

type AgentAuthConfig = NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>;
type OidcConfig = NonNullable<AgentAuthConfig['oidc']>;
type ApiKeyConfig = NonNullable<AgentAuthConfig['apiKey']>;
type JwtVerifyCallback = (err: Error | null, payload?: JwtPayload) => void;
type FindUserCondition = Pick<Partial<IUser>, '_id' | 'email' | 'openidId' | 'idOnTheSource'>;
type FindUserQuery = FindUserCondition & { $or?: FindUserCondition[] };

const mockUser = { _id: 'uid123', id: 'uid123', email: 'agent@test.com' };
const originalEnv = ENV_KEYS.reduce<Record<(typeof ENV_KEYS)[number], string | undefined>>(
  (env, key) => ({ ...env, [key]: process.env[key] }),
  {
    OPENID_JWKS_URL: undefined,
    OPENID_JWKS_URL_CACHE_ENABLED: undefined,
    OPENID_JWKS_URL_CACHE_TIME: undefined,
    PROXY: undefined,
  },
);

function deleteEnvKeys() {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
}

function restoreOriginalEnv() {
  ENV_KEYS.forEach((key) => {
    const value = originalEnv[key];
    if (value == null) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  });
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

function makeReq(headers: Record<string, string> = {}): Partial<Request> {
  return { headers };
}

function makeConfig(
  oidcOverrides?: Partial<OidcConfig>,
  apiKeyOverrides?: Partial<ApiKeyConfig>,
): AppConfig {
  return {
    endpoints: {
      agents: {
        remoteApi: {
          auth: {
            oidc: {
              enabled: true,
              issuer: BASE_ISSUER,
              jwksUri: BASE_JWKS_URI,
              ...oidcOverrides,
            },
            apiKey: { enabled: true, ...apiKeyOverrides },
          },
        },
      },
    },
  } as unknown as AppConfig;
}

function makeUser(overrides: Partial<IUser> = {}): IUser {
  return {
    ...mockUser,
    role: 'user',
    provider: 'openid',
    openidId: 'sub123',
    ...overrides,
  } as IUser;
}

function matchesCondition(user: IUser, condition: FindUserCondition): boolean {
  if (condition._id != null && user._id !== condition._id) return false;
  if (condition.email != null && user.email !== condition.email) return false;
  if (condition.openidId != null && user.openidId !== condition.openidId) return false;
  if (condition.idOnTheSource != null && user.idOnTheSource !== condition.idOnTheSource) {
    return false;
  }
  return true;
}

function makeFindUser(...users: IUser[]): jest.MockedFunction<UserMethods['findUser']> {
  return jest.fn(async (query) => {
    const userQuery = query as FindUserQuery;
    const conditions = userQuery.$or ?? [userQuery];
    return (
      users.find((user) => conditions.some((condition) => matchesCondition(user, condition))) ??
      null
    );
  }) as jest.MockedFunction<UserMethods['findUser']>;
}

function makeDeps(appConfig: AppConfig | null = makeConfig()) {
  return {
    findUser: makeFindUser(makeUser()),
    updateUser: jest.fn(),
    getAppConfig: jest.fn().mockResolvedValue(appConfig),
    apiKeyMiddleware: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  };
}

function setupOidcMocks(payload: JwtPayload, kid: string | null = 'test-kid') {
  (jwt.decode as jest.Mock).mockReturnValue({ header: kid == null ? {} : { kid }, payload });
  mockGetSigningKey.mockResolvedValue({ getPublicKey: () => 'public-key' });
  mockGetSigningKeys.mockResolvedValue([
    { kid: kid ?? 'test-kid', getPublicKey: () => 'public-key' },
  ]);
  (jwt.verify as jest.Mock).mockImplementation(
    (_t: string, _k: string, _o: VerifyOptions, cb: JwtVerifyCallback) => cb(null, payload),
  );
}

describe('createRemoteAgentAuth', () => {
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    deleteEnvKeys();
    clearRemoteAgentAuthCache();
    mockFetch.mockReset();
    mockGetTenantId.mockReset();
    mockGetTenantId.mockReturnValue(undefined);
    mockMath.mockReturnValue(60000);
    mockFindOpenIDUser.mockImplementation(realFindOpenIDUser);
    mockNext = jest.fn();
  });

  afterEach(() => {
    deleteEnvKeys();
    clearRemoteAgentAuthCache();
  });

  afterAll(() => {
    restoreOriginalEnv();
  });

  describe('when OIDC is not enabled', () => {
    it('falls back to apiKeyMiddleware when getAppConfig returns null', async () => {
      const deps = makeDeps(null);
      const mw = createRemoteAgentAuth(deps);
      const req = makeReq();
      const { res } = makeRes();

      await mw(req as Request, res, mockNext);

      expect(deps.apiKeyMiddleware).toHaveBeenCalledWith(req, res, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 401 when oidc.enabled is false and apiKey is disabled', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('falls back to apiKeyMiddleware when oidc.enabled is false', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }));
      await createRemoteAgentAuth(deps)(makeReq() as Request, makeRes().res, mockNext);
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('loads config with pre-auth tenant context when present', async () => {
      mockGetTenantId.mockReturnValue('tenant-a');
      const deps = makeDeps(makeConfig({ enabled: false }));

      await createRemoteAgentAuth(deps)(makeReq() as Request, makeRes().res, mockNext);

      expect(deps.getAppConfig).toHaveBeenCalledWith({ tenantId: 'tenant-a' });
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('falls back to apiKeyMiddleware when remoteApi auth is absent', async () => {
      const deps = makeDeps({ endpoints: { agents: {} } } as unknown as AppConfig);
      await createRemoteAgentAuth(deps)(makeReq() as Request, makeRes().res, mockNext);
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('returns 401 when remoteApi auth is absent and apiKey is disabled', async () => {
      const config = {
        endpoints: { agents: { remoteApi: { auth: { apiKey: { enabled: false } } } } },
      } as unknown as AppConfig;
      const deps = makeDeps(config);
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('when OIDC enabled but no Bearer token', () => {
    it('falls back to apiKeyMiddleware when apiKey is enabled', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 401 when apiKey is disabled and no token present', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Bearer token required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 500 when OIDC is enabled without an issuer', async () => {
      const deps = makeDeps(makeConfig({ issuer: undefined }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('when OIDC verification succeeds', () => {
    it('sets req.user and calls next()', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', exp: 9999999999 });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      const { res } = makeRes();

      await createRemoteAgentAuth(deps)(req as Request, res, mockNext);

      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@test.com' });
      expect(mockNext).toHaveBeenCalledWith();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('allows RSA, RSA-PSS, and ECDSA signing algorithms', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });
      const deps = makeDeps();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect((jwt.verify as jest.Mock).mock.calls[0][2]).toEqual(
        expect.objectContaining({
          algorithms: expect.arrayContaining([
            'RS256',
            'RS384',
            'RS512',
            'PS256',
            'PS384',
            'PS512',
            'ES256',
            'ES384',
            'ES512',
          ]),
        }),
      );
    });

    it('does not allow HMAC signing algorithms', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });
      const deps = makeDeps();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect((jwt.verify as jest.Mock).mock.calls[0][2]).toEqual(
        expect.objectContaining({
          algorithms: expect.not.arrayContaining(['HS256', 'HS384', 'HS512']),
        }),
      );
    });

    it('tries signing keys until a token without kid verifies', async () => {
      const payload = { sub: 'sub123', email: 'agent@test.com' };
      setupOidcMocks(payload, null);
      mockGetSigningKeys.mockResolvedValue([
        { kid: 'first-kid', getPublicKey: () => 'first-public-key' },
        { kid: 'second-kid', getPublicKey: () => 'second-public-key' },
      ]);
      (jwt.verify as jest.Mock).mockImplementation(
        (_t: string, key: string, _o: VerifyOptions, cb: JwtVerifyCallback) => {
          if (key === 'first-public-key') {
            cb(new Error('invalid signature'));
            return;
          }
          cb(null, payload);
        },
      );

      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(mockGetSigningKey).not.toHaveBeenCalled();
      expect(jwt.verify).toHaveBeenCalledTimes(2);
      expect((jwt.verify as jest.Mock).mock.calls[0][1]).toBe('first-public-key');
      expect((jwt.verify as jest.Mock).mock.calls[1][1]).toBe('second-public-key');
      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@test.com' });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('attaches federatedTokens with access_token and expires_at', async () => {
      const exp = 1234567890;
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', exp });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect((req.user as IUser).federatedTokens).toEqual({
        access_token: FAKE_TOKEN,
        expires_at: exp,
      });
    });

    it('falls back to apiKeyMiddleware when user is not found and apiKey is enabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      deps.findUser.mockResolvedValue(null);
      const { res } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no matching LibreChat user'),
      );
    });

    it('returns 401 when user is not found and apiKey is disabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });

      const deps = makeDeps(makeConfig({}, { enabled: false }));
      deps.findUser.mockResolvedValue(null);
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 without user lookup when sub claim is missing', async () => {
      setupOidcMocks({ email: 'agent@test.com' });

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(findOpenIDUser).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 without API key fallback when OpenID user resolution is rejected', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      deps.findUser
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeUser({ provider: 'google', openidId: undefined }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('when OIDC verification fails', () => {
    beforeEach(() => {
      (jwt.decode as jest.Mock).mockReturnValue({ header: { kid: 'kid' }, payload: {} });
      mockGetSigningKey.mockRejectedValue(new Error('Signing key not found'));
    });

    it('falls back to apiKeyMiddleware when apiKey is enabled', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('OIDC verification failed'),
        expect.any(Error),
      );
    });

    it('returns 401 when apiKey is disabled', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('returns 401 when JWT cannot be decoded', async () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: 'Bearer not.a.jwt' }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when verifier rejects a HMAC-signed token', async () => {
      const payload = { sub: 'sub123', email: 'agent@test.com' };
      setupOidcMocks(payload);
      (jwt.decode as jest.Mock).mockReturnValue({
        header: { alg: 'HS256', kid: 'test-kid' },
        payload,
      });
      (jwt.verify as jest.Mock).mockImplementation(
        (_t: string, _k: string, _options: VerifyOptions, cb: JwtVerifyCallback) => {
          cb(new Error('invalid algorithm'));
        },
      );

      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect((jwt.verify as jest.Mock).mock.calls[0][2]).toEqual(
        expect.objectContaining({
          algorithms: expect.not.arrayContaining(['HS256', 'HS384', 'HS512']),
        }),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('unexpected errors', () => {
    it('returns 500 when getAppConfig throws', async () => {
      const deps = {
        ...makeDeps(),
        getAppConfig: jest.fn().mockRejectedValue(new Error('DB down')),
      };
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected error'),
        expect.any(Error),
      );
    });

    it('returns 500 when findOpenIDUser throws', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });
      mockFindOpenIDUser.mockRejectedValue(new Error('DB error'));

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('JWKS URI resolution', () => {
    beforeEach(() => {
      setupOidcMocks({ sub: 'sub123', email: 'a@b.com' });
    });

    it('uses jwksUri from config and skips discovery', async () => {
      const deps = makeDeps(
        makeConfig({
          jwksUri: 'https://explicit-1.example.com/jwks',
          issuer: 'https://issuer-explicit-1.example.com',
        }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('uses OPENID_JWKS_URL env var and skips discovery', async () => {
      process.env.OPENID_JWKS_URL = 'https://env.example.com/jwks';
      const deps = makeDeps(
        makeConfig({ jwksUri: undefined, issuer: 'https://issuer-env-1.example.com' }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('fetches discovery document when jwksUri and env var are absent', async () => {
      const issuer = 'https://issuer-discovery-1.example.com';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ jwks_uri: `${issuer}/protocol/openid-connect/certs` }),
      });

      const deps = makeDeps(makeConfig({ jwksUri: undefined, issuer }));

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `${issuer}/.well-known/openid-configuration`,
        expect.objectContaining({ signal: expect.any(Object) }),
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('uses a proxy agent for discovery when PROXY is set', async () => {
      process.env.PROXY = 'http://proxy.example.com';
      const issuer = 'https://issuer-proxy.example.com';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ jwks_uri: `${issuer}/protocol/openid-connect/certs` }),
      });

      const deps = makeDeps(makeConfig({ jwksUri: undefined, issuer }));

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockProxyAgent).toHaveBeenCalledWith('http://proxy.example.com');
      expect(mockFetch).toHaveBeenCalledWith(
        `${issuer}/.well-known/openid-configuration`,
        expect.objectContaining({ dispatcher: { proxy: 'http://proxy.example.com' } }),
      );
    });

    it('caches JWKS clients by resolved URI', async () => {
      process.env.OPENID_JWKS_URL = 'https://env-one.example.com/jwks';
      const deps = makeDeps(
        makeConfig({ jwksUri: undefined, issuer: 'https://issuer-env-cache.example.com' }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      process.env.OPENID_JWKS_URL = 'https://env-two.example.com/jwks';

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(jwksRsa).toHaveBeenCalledWith(
        expect.objectContaining({ jwksUri: 'https://env-one.example.com/jwks' }),
      );
      expect(jwksRsa).toHaveBeenCalledWith(
        expect.objectContaining({ jwksUri: 'https://env-two.example.com/jwks' }),
      );
    });

    it('honors disabled JWKS caching', async () => {
      process.env.OPENID_JWKS_URL_CACHE_ENABLED = 'false';
      const deps = makeDeps(
        makeConfig({
          jwksUri: 'https://cache-disabled.example.com/jwks',
          issuer: 'https://issuer-cache-disabled.example.com',
        }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(jwksRsa).toHaveBeenCalledTimes(2);
    });

    it('evicts the oldest JWKS client entry when the cache exceeds its limit', async () => {
      const runRequest = async (index: number) => {
        const deps = makeDeps(
          makeConfig({
            jwksUri: `https://cache-${index}.example.com/jwks`,
            issuer: `https://issuer-cache-${index}.example.com`,
          }),
        );

        await createRemoteAgentAuth(deps)(
          makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
          makeRes().res,
          mockNext,
        );
      };

      for (let i = 0; i < 101; i++) {
        await runRequest(i);
      }
      await runRequest(0);

      expect(jwksRsa).toHaveBeenCalledTimes(102);
      expect(jwksRsa).toHaveBeenLastCalledWith(
        expect.objectContaining({ jwksUri: 'https://cache-0.example.com/jwks' }),
      );
    });

    it('prunes expired JWKS client entries before evicting valid entries', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
      const runRequest = async (key: string) => {
        const deps = makeDeps(
          makeConfig({
            jwksUri: `https://cache-prune-${key}.example.com/jwks`,
            issuer: `https://issuer-cache-prune-${key}.example.com`,
          }),
        );

        await createRemoteAgentAuth(deps)(
          makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
          makeRes().res,
          mockNext,
        );
      };

      try {
        mockMath.mockReturnValue(120000);
        await runRequest('keeper');

        mockMath.mockReturnValue(1000);
        for (let i = 0; i < 99; i++) {
          await runRequest(`expired-${i}`);
        }

        nowSpy.mockReturnValue(2000);
        mockMath.mockReturnValue(60000);
        await runRequest('new');

        expect(jwksRsa).toHaveBeenCalledTimes(101);

        await runRequest('keeper');

        expect(jwksRsa).toHaveBeenCalledTimes(101);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('aborts discovery when the timeout expires', async () => {
      jest.useFakeTimers();

      try {
        mockFetch.mockImplementation(
          (_url: string, init?: RequestInit) =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
            }),
        );

        const deps = makeDeps(
          makeConfig(
            { jwksUri: undefined, issuer: 'https://issuer-discovery-timeout.example.com' },
            { enabled: false },
          ),
        );
        const { res, status } = makeRes();
        const request = createRemoteAgentAuth(deps)(
          makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
          res,
          mockNext,
        );

        await Promise.resolve();
        jest.advanceTimersByTime(10000);
        await request;

        expect(status).toHaveBeenCalledWith(401);
        expect(mockNext).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns 401 when discovery returns non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      const deps = makeDeps(
        makeConfig(
          { jwksUri: undefined, issuer: 'https://issuer-discovery-fail-1.example.com' },
          { enabled: false },
        ),
      );
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when discovery response is missing jwks_uri field', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      const deps = makeDeps(
        makeConfig(
          { jwksUri: undefined, issuer: 'https://issuer-missing-jwks-1.example.com' },
          { enabled: false },
        ),
      );
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
    });
  });

  describe('email claim resolution', () => {
    async function captureEmailArg(claims: JwtPayload): Promise<string | undefined> {
      setupOidcMocks(claims);

      const deps = makeDeps();
      deps.findUser
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeUser({ email: getExpectedEmail(claims), openidId: claims.sub }));
      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      return (deps.findUser.mock.calls[1]?.[0] as { email?: string } | undefined)?.email;
    }

    function getExpectedEmail(claims: JwtPayload): string | undefined {
      return (
        (claims['email'] as string | undefined) ??
        (claims['preferred_username'] as string | undefined) ??
        (claims['upn'] as string | undefined)
      );
    }

    it('uses email claim', async () => {
      expect(await captureEmailArg({ sub: 's1', email: 'user@example.com' })).toBe(
        'user@example.com',
      );
    });

    it('falls back to preferred_username when email is absent', async () => {
      expect(await captureEmailArg({ sub: 's2', preferred_username: 'agent-user' })).toBe(
        'agent-user',
      );
    });

    it('falls back to upn when email and preferred_username are absent', async () => {
      expect(await captureEmailArg({ sub: 's3', upn: 'upn@corp.com' })).toBe('upn@corp.com');
    });
  });

  describe('update user and migration scenarios', () => {
    it('persists openidId binding when migration is needed', async () => {
      const mockUpdateUser = jest.fn().mockResolvedValue(undefined);
      setupOidcMocks({ sub: 'sub-new', email: 'existing@test.com' });

      const deps = { ...makeDeps(), updateUser: mockUpdateUser };
      deps.findUser.mockResolvedValueOnce(null).mockResolvedValueOnce(
        makeUser({
          email: 'existing@test.com',
          openidId: undefined,
          provider: undefined,
          role: 'user',
        }),
      );
      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockUpdateUser).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ provider: 'openid', openidId: 'sub-new' }),
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 500 when migration update fails', async () => {
      const mockUpdateUser = jest.fn().mockRejectedValue(new Error('DB write failed'));
      setupOidcMocks({ sub: 'sub-new', email: 'existing@test.com' });

      const deps = { ...makeDeps(makeConfig({}, { enabled: true })), updateUser: mockUpdateUser };
      deps.findUser.mockResolvedValueOnce(null).mockResolvedValueOnce(
        makeUser({
          email: 'existing@test.com',
          openidId: undefined,
          provider: undefined,
          role: 'user',
        }),
      );
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('does not call updateUser when migration is false and role exists', async () => {
      const mockUpdateUser = jest.fn();
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });

      const deps = { ...makeDeps(), updateUser: mockUpdateUser };
      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe('scope validation', () => {
    it('returns 401 when required scope is missing from token', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', scope: 'openid profile' });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent' }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('does not fall back to apiKeyMiddleware when a verified token is missing scope', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', scope: 'openid profile' });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent' }, { enabled: true }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('passes when required scope is present in token', async () => {
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        scope: 'openid profile remote_agent',
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent' }));
      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('passes when scp is an array containing the required scope', async () => {
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        scp: ['openid', 'remote_agent'],
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent' }));
      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('passes when all configured scopes are present', async () => {
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        scp: ['openid', 'remote_agent', 'admin'],
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent admin' }));
      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 401 when any configured scope is missing', async () => {
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        scp: ['openid', 'remote_agent'],
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent admin' }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('treats comma-separated configured scopes as one invalid scope token', async () => {
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        scope: 'remote_agent admin',
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent,admin' }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('passes when scope is not configured (backward compat)', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com' });

      const deps = makeDeps(makeConfig({ scope: undefined }));
      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
