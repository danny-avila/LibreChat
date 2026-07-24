import type {
  AppConfig,
  IRole,
  IUser,
  RoleMethods,
  UserGroupMethods,
  UserMethods,
} from '@librechat/data-schemas';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import type { JwtPayload, VerifyOptions } from 'jsonwebtoken';
import type { Request, Response } from 'express';
import type { RequestInit } from 'undici';
import type { RemoteAgentAuthDeps } from './remoteAgentAuth';

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

jest.mock('~/utils', () => ({
  isEnabled: jest.fn(() => false),
  math: jest.fn(() => 60000),
}));

jest.mock('~/utils/proxy', () => ({
  getEnvProxyDispatcher: jest.fn(),
  getHttpsProxyAgent: jest.fn(),
}));

const mockGetSigningKey = jest.fn();
const mockGetSigningKeys = jest.fn();

jest.mock('jwks-rsa', () =>
  jest.fn(() => ({ getSigningKey: mockGetSigningKey, getSigningKeys: mockGetSigningKeys })),
);

jest.mock('undici', () => ({
  fetch: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('../auth/openid', () => {
  const actual = jest.requireActual('../auth/openid') as typeof import('../auth/openid');
  return { ...actual, findOpenIDUser: jest.fn(actual.findOpenIDUser) };
});

jest.mock('../auth/entraGroupSync', () => {
  const actual = jest.requireActual(
    '../auth/entraGroupSync',
  ) as typeof import('../auth/entraGroupSync');
  return {
    ...actual,
    syncUserEntraGroupMemberships: jest.fn(async () => ({ attempted: false, synced: false })),
  };
});

jest.mock('../auth/openidUserInfo', () => {
  const actual = jest.requireActual(
    '../auth/openidUserInfo',
  ) as typeof import('../auth/openidUserInfo');
  return {
    ...actual,
    enrichOpenIdProfile: jest.fn(async ({ claims }) => ({ status: 'skipped', profile: claims })),
  };
});

jest.mock('../auth/federatedAuthCache', () => {
  const actual = jest.requireActual(
    '../auth/federatedAuthCache',
  ) as typeof import('../auth/federatedAuthCache');
  return {
    ...actual,
    readFederatedAuthCache: jest.fn(async () => null),
    writeFederatedAuthCache: jest.fn(async () => undefined),
  };
});

import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { SystemRoles } from 'librechat-data-provider';
import { fetch as undiciFetch } from 'undici';
import { getTenantId, logger, tenantStorage } from '@librechat/data-schemas';
import { clearRemoteAgentAuthCache, createRemoteAgentAuth } from './remoteAgentAuth';
import { findOpenIDUser, getOpenIdEmail } from '../auth/openid';
import { syncUserEntraGroupMemberships } from '../auth/entraGroupSync';
import { enrichOpenIdProfile } from '../auth/openidUserInfo';
import { readFederatedAuthCache, writeFederatedAuthCache } from '../auth/federatedAuthCache';
import { isEnabled, math } from '~/utils';
import { getEnvProxyDispatcher, getHttpsProxyAgent } from '~/utils/proxy';

const mockFetch = undiciFetch as jest.Mock;
const mockMath = math as jest.Mock;
const mockIsEnabled = isEnabled as jest.Mock;
const mockGetEnvProxyDispatcher = getEnvProxyDispatcher as jest.Mock;
const mockGetHttpsProxyAgent = getHttpsProxyAgent as jest.Mock;
const realFindOpenIDUser =
  jest.requireActual<typeof import('../auth/openid')>('../auth/openid').findOpenIDUser;
const mockFindOpenIDUser = findOpenIDUser as jest.MockedFunction<typeof findOpenIDUser>;
const mockSyncUserEntraGroupMemberships = syncUserEntraGroupMemberships as jest.MockedFunction<
  typeof syncUserEntraGroupMemberships
>;
const mockEnrichOpenIdProfile = enrichOpenIdProfile as jest.MockedFunction<
  typeof enrichOpenIdProfile
>;
const mockReadFederatedAuthCache = readFederatedAuthCache as jest.MockedFunction<
  typeof readFederatedAuthCache
>;
const mockWriteFederatedAuthCache = writeFederatedAuthCache as jest.MockedFunction<
  typeof writeFederatedAuthCache
>;
const FAKE_TOKEN = 'header.payload.signature';
const BASE_ISSUER = 'https://auth.example.com/realms/test';
const BASE_JWKS_URI = `${BASE_ISSUER}/protocol/openid-connect/certs`;
const FORBIDDEN_PERSISTED_TOKEN_KEYS = [
  'federatedTokens',
  'openidTokens',
  'access_token',
  'refresh_token',
  'id_token',
] as const;
const ENV_KEYS = [
  'OPENID_EMAIL_CLAIM',
  'OPENID_JWKS_URL',
  'OPENID_JWKS_URL_CACHE_ENABLED',
  'OPENID_JWKS_URL_CACHE_TIME',
  'OPENID_ISSUER',
  'OPENID_CLIENT_ID',
  'OPENID_CLIENT_SECRET',
  'OPENID_ROLE_SYNC_ENABLED',
  'OPENID_ROLE_SYNC_API_ENABLED',
  'OPENID_ROLE_SYNC_SOURCE',
  'OPENID_ROLE_SYNC_CLAIM',
  'OPENID_ROLE_SYNC_ROLE_PRIORITY',
  'OPENID_ROLE_SYNC_FALLBACK_ROLE',
  'PROXY',
  'TENANT_ISOLATION_STRICT',
] as const;

type AgentAuthConfig = NonNullable<NonNullable<TAgentsEndpoint['remoteApi']>['auth']>;
type OidcConfig = NonNullable<AgentAuthConfig['oidc']>;
type OidcConfigOverrides = Partial<
  Omit<OidcConfig, 'provisioning' | 'userInfo' | 'profileSync' | 'groupSync' | 'federatedAuthCache'>
> & {
  provisioning?: Partial<NonNullable<OidcConfig['provisioning']>>;
  userInfo?: Partial<NonNullable<OidcConfig['userInfo']>>;
  profileSync?: Partial<NonNullable<OidcConfig['profileSync']>>;
  groupSync?: Partial<NonNullable<OidcConfig['groupSync']>>;
  federatedAuthCache?: Partial<NonNullable<OidcConfig['federatedAuthCache']>>;
};
type ApiKeyConfig = NonNullable<AgentAuthConfig['apiKey']>;
type JwtVerifyCallback = (err: Error | null, payload?: JwtPayload) => void;
type FindUserValue = IUser['_id'] | string | null | { $exists: boolean };
type FindUserCondition = {
  _id?: FindUserValue;
  email?: FindUserValue;
  openidId?: FindUserValue;
  openidIssuer?: FindUserValue;
  idOnTheSource?: FindUserValue;
  $or?: FindUserCondition[];
};
type FindUserQuery = FindUserCondition & { $or?: FindUserCondition[] };

const mockUser = {
  _id: 'uid123' as unknown as IUser['_id'],
  id: 'uid123',
  email: 'agent@example.com',
};
const defaultProvisioning = {
  enabled: false,
};
const defaultUserInfo = {
  fetch: false,
  require: false,
};
const defaultProfileSync = {
  onCreate: true,
  forExisting: false,
};
const defaultGroupSync = {
  onCreate: false,
  forExisting: false,
};
const defaultFederatedAuthCache = {
  enabled: true,
  ttlSeconds: 300,
};
const originalEnv = ENV_KEYS.reduce<Record<(typeof ENV_KEYS)[number], string | undefined>>(
  (env, key) => ({ ...env, [key]: process.env[key] }),
  {
    OPENID_EMAIL_CLAIM: undefined,
    OPENID_JWKS_URL: undefined,
    OPENID_JWKS_URL_CACHE_ENABLED: undefined,
    OPENID_JWKS_URL_CACHE_TIME: undefined,
    OPENID_ISSUER: undefined,
    OPENID_CLIENT_ID: undefined,
    OPENID_CLIENT_SECRET: undefined,
    OPENID_ROLE_SYNC_ENABLED: undefined,
    OPENID_ROLE_SYNC_API_ENABLED: undefined,
    OPENID_ROLE_SYNC_SOURCE: undefined,
    OPENID_ROLE_SYNC_CLAIM: undefined,
    OPENID_ROLE_SYNC_ROLE_PRIORITY: undefined,
    OPENID_ROLE_SYNC_FALLBACK_ROLE: undefined,
    PROXY: undefined,
    TENANT_ISOLATION_STRICT: undefined,
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
  oidcOverrides?: OidcConfigOverrides,
  apiKeyOverrides?: Partial<ApiKeyConfig>,
): AppConfig {
  const {
    provisioning,
    userInfo,
    profileSync,
    groupSync,
    federatedAuthCache,
    ...baseOidcOverrides
  } = oidcOverrides ?? {};
  return {
    endpoints: {
      agents: {
        remoteApi: {
          auth: {
            oidc: {
              enabled: true,
              issuer: BASE_ISSUER,
              audience: 'remote-agent-api',
              jwksUri: BASE_JWKS_URI,
              provisioning: {
                ...defaultProvisioning,
                ...provisioning,
              },
              userInfo: { ...defaultUserInfo, ...userInfo },
              profileSync: { ...defaultProfileSync, ...profileSync },
              groupSync: { ...defaultGroupSync, ...groupSync },
              federatedAuthCache: { ...defaultFederatedAuthCache, ...federatedAuthCache },
              ...baseOidcOverrides,
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
    openidIssuer: BASE_ISSUER,
    ...overrides,
  } as IUser;
}

function matchesValue(value: FindUserValue | undefined, condition: FindUserValue): boolean {
  if (condition && typeof condition === 'object' && '$exists' in condition) {
    return condition.$exists ? value != null : value == null;
  }
  return value === condition;
}

function matchesCondition(user: IUser, condition: FindUserCondition): boolean {
  if (condition.$or && !condition.$or.some((nested) => matchesCondition(user, nested))) {
    return false;
  }
  if (condition._id !== undefined && !matchesValue(user._id, condition._id)) return false;
  if (condition.email !== undefined && !matchesValue(user.email, condition.email)) return false;
  if (condition.openidId !== undefined && !matchesValue(user.openidId, condition.openidId)) {
    return false;
  }
  if (
    condition.openidIssuer !== undefined &&
    !matchesValue(user.openidIssuer, condition.openidIssuer)
  ) {
    return false;
  }
  if (
    condition.idOnTheSource !== undefined &&
    !matchesValue(user.idOnTheSource, condition.idOnTheSource)
  ) {
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

function mockMethod<T extends (...args: never[]) => unknown>(
  implementation: T,
): jest.MockedFunction<T> {
  const typedImplementation = implementation as unknown as (
    ...args: Parameters<T>
  ) => ReturnType<T>;
  return jest.fn<ReturnType<T>, Parameters<T>>(
    typedImplementation,
  ) as unknown as jest.MockedFunction<T>;
}

function makeDeps(appConfig: AppConfig = makeConfig()) {
  const updateResult = {
    acknowledged: true,
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 0,
    upsertedId: null,
  };

  return {
    findUser: makeFindUser(makeUser()),
    createUser: mockMethod<UserMethods['createUser']>(async () => makeUser()),
    updateUser: mockMethod<UserMethods['updateUser']>(async (_userId, update) =>
      makeUser(update as Partial<IUser>),
    ),
    getRolesByNames: mockMethod<RoleMethods['findRolesByNames']>(async (roleNames) =>
      roleNames.map((roleName) => ({ name: roleName }) as IRole),
    ),
    bulkUpdateGroups: mockMethod<UserGroupMethods['bulkUpdateGroups']>(async () => updateResult),
    findGroupsByExternalIds: mockMethod<UserGroupMethods['findGroupsByExternalIds']>(
      async () => [],
    ),
    upsertGroupByExternalId: mockMethod<UserGroupMethods['upsertGroupByExternalId']>(
      async () => null,
    ),
    getAppConfig: jest.fn().mockResolvedValue(appConfig),
    apiKeyMiddleware: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  };
}

function asDeps(deps: ReturnType<typeof makeDeps>): RemoteAgentAuthDeps {
  return deps as unknown as RemoteAgentAuthDeps;
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

function expectNoPersistedTokenFields(payload: Record<string, unknown>) {
  FORBIDDEN_PERSISTED_TOKEN_KEYS.forEach((key) => {
    expect(payload).not.toHaveProperty(key);
  });
}

describe('createRemoteAgentAuth', () => {
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    deleteEnvKeys();
    clearRemoteAgentAuthCache();
    mockFetch.mockReset();
    mockMath.mockReturnValue(60000);
    mockIsEnabled.mockImplementation((value?: string) => value === 'true');
    mockGetEnvProxyDispatcher.mockReturnValue(undefined);
    mockGetHttpsProxyAgent.mockReturnValue(undefined);
    mockFindOpenIDUser.mockImplementation(realFindOpenIDUser);
    mockSyncUserEntraGroupMemberships.mockResolvedValue({ attempted: false, synced: false });
    mockEnrichOpenIdProfile.mockImplementation(async ({ claims }) => ({
      status: 'skipped',
      profile: claims,
      reason: 'disabled',
    }));
    mockReadFederatedAuthCache.mockResolvedValue(null);
    mockWriteFederatedAuthCache.mockResolvedValue(undefined);
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
    it('returns 401 when oidc.enabled is false and apiKey is disabled', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('falls back to apiKeyMiddleware when oidc.enabled is false', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }));
      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, makeRes().res, mockNext);
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('loads base config before authentication when tenant context is absent', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }));

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, makeRes().res, mockNext);

      expect(deps.getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('rejects API key auth when the resolved user tenant disables API keys', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }, { enabled: true }));
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-oidc-only'
          ? makeConfig({ enabled: true }, { enabled: false })
          : makeConfig({ enabled: false }, { enabled: true }),
      );
      deps.apiKeyMiddleware.mockImplementation((req: unknown, _res: unknown, next) => {
        (req as Request).user = makeUser({ tenantId: 'tenant-oidc-only' });
        next();
      });
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);

      expect(deps.getAppConfig).toHaveBeenNthCalledWith(1, { baseOnly: true });
      expect(deps.getAppConfig).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tenantId: 'tenant-oidc-only' }),
      );
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('loads tenant config from pre-auth tenant context before authentication', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }));

      await tenantStorage.run({ tenantId: 'tenant-preauth' }, async () => {
        await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, makeRes().res, mockNext);
      });

      expect(deps.getAppConfig).toHaveBeenCalledWith({ tenantId: 'tenant-preauth' });
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('enforces tenant auth policy from pre-auth tenant context', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }));
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-oidc-only'
          ? makeConfig({ enabled: false }, { enabled: false })
          : makeConfig({ enabled: false }, { enabled: true }),
      );
      const { res, status } = makeRes();

      await tenantStorage.run({ tenantId: 'tenant-oidc-only' }, async () => {
        await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);
      });

      expect(deps.getAppConfig).toHaveBeenCalledWith({ tenantId: 'tenant-oidc-only' });
      expect(status).toHaveBeenCalledWith(401);
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('loads tenant config when an authenticated user is already present', async () => {
      const deps = makeDeps(makeConfig({ enabled: false }));
      const req = makeReq();
      req.user = makeUser({ tenantId: 'tenant-a' });

      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(deps.getAppConfig).toHaveBeenCalledWith({ tenantId: 'tenant-a' });
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('falls back to apiKeyMiddleware when remoteApi auth is absent', async () => {
      const deps = makeDeps({ endpoints: { agents: {} } } as unknown as AppConfig);
      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, makeRes().res, mockNext);
      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
    });

    it('returns 401 when remoteApi auth is absent and apiKey is disabled', async () => {
      const config = {
        endpoints: { agents: { remoteApi: { auth: { apiKey: { enabled: false } } } } },
      } as unknown as AppConfig;
      const deps = makeDeps(config);
      const { res, status } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });
  });

  describe('when OIDC enabled but no Bearer token', () => {
    it('falls back to apiKeyMiddleware when apiKey is enabled', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);

      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 401 when apiKey is disabled and no token present', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Bearer token required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 500 when OIDC is enabled without an issuer', async () => {
      const deps = makeDeps(makeConfig({ issuer: undefined }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 500 when OIDC is enabled without an audience', async () => {
      const deps = makeDeps(makeConfig({ audience: undefined }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('when OIDC verification succeeds', () => {
    it('sets req.user and calls next()', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com', exp: 9999999999 });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      const { res } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(req as Request, res, mockNext);

      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@example.com' });
      expect((jwt.verify as jest.Mock).mock.calls[0][2]).toEqual(
        expect.objectContaining({ audience: 'remote-agent-api' }),
      );
      expect(mockNext).toHaveBeenCalledWith();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('re-evaluates OIDC auth config after resolving the user tenant', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com', scope: 'remote_agent' });
      const deps = makeDeps();
      deps.findUser = makeFindUser(makeUser({ tenantId: 'tenant-strict' }));
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-strict'
          ? makeConfig({ audience: 'tenant-audience', scope: 'remote_agent' }, { enabled: false })
          : makeConfig({ scope: undefined }, { enabled: true }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(deps.getAppConfig).toHaveBeenNthCalledWith(1, { baseOnly: true });
      expect(deps.getAppConfig).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tenantId: 'tenant-strict' }),
      );
      expect(jwt.verify).toHaveBeenCalledTimes(2);
      expect((jwt.verify as jest.Mock).mock.calls[1][2]).toEqual(
        expect.objectContaining({ audience: 'tenant-audience' }),
      );
      expect(req.user).toMatchObject({ id: 'uid123', tenantId: 'tenant-strict' });
      expect(mockNext).toHaveBeenCalledWith();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('persists deferred OpenID migration after resolved tenant policy succeeds', async () => {
      setupOidcMocks({ sub: 'sub-new', email: 'legacy@example.com', scope: 'remote_agent' });
      const existing = makeUser({
        email: 'legacy@example.com',
        tenantId: 'tenant-strict',
        provider: undefined,
        openidId: undefined,
        openidIssuer: undefined,
      });
      const deps = makeDeps();
      deps.findUser = makeFindUser(existing);
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-strict'
          ? makeConfig({ audience: 'tenant-audience', scope: 'remote_agent' }, { enabled: false })
          : makeConfig({ scope: undefined }, { enabled: true }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      deps.updateUser.mockImplementation(async (_userId, update) =>
        makeUser({ ...existing, ...(update as Partial<IUser>) }),
      );

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(deps.getAppConfig).toHaveBeenNthCalledWith(1, { baseOnly: true });
      expect(deps.getAppConfig).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tenantId: 'tenant-strict' }),
      );
      expect(deps.updateUser).toHaveBeenCalledWith(
        existing._id.toString(),
        expect.objectContaining({
          provider: 'openid',
          openidId: 'sub-new',
          openidIssuer: BASE_ISSUER,
        }),
      );
      expect(req.user).toMatchObject({
        email: 'legacy@example.com',
        tenantId: 'tenant-strict',
        openidId: 'sub-new',
      });
      expect(mockNext).toHaveBeenCalledWith();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('preserves enriched profile data during deferred tenant account reconciliation', async () => {
      setupOidcMocks({ sub: 'sub-new', email: 'legacy@example.com', scope: 'remote_agent' });
      mockEnrichOpenIdProfile.mockResolvedValueOnce({
        status: 'fetched',
        profile: {
          sub: 'sub-new',
          email: 'legacy@example.com',
          given_name: 'Enriched',
          family_name: 'Profile Name',
          preferred_username: 'enriched-user',
        },
      });
      const existing = makeUser({
        email: 'legacy@example.com',
        tenantId: 'tenant-strict',
        provider: undefined,
        openidId: undefined,
        openidIssuer: undefined,
      });
      const deps = makeDeps();
      deps.findUser = makeFindUser(existing);
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-strict'
          ? makeConfig(
              {
                audience: 'tenant-audience',
                scope: 'remote_agent',
                profileSync: { forExisting: true },
              },
              { enabled: false },
            )
          : makeConfig(
              {
                scope: undefined,
                userInfo: { fetch: true },
              },
              { enabled: true },
            ),
      );
      deps.updateUser.mockImplementation(async (_userId, update) =>
        makeUser({ ...existing, ...(update as Partial<IUser>) }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(deps.updateUser).toHaveBeenCalledWith(
        existing._id.toString(),
        expect.objectContaining({
          name: 'Enriched Profile Name',
          username: 'enriched-user',
        }),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('rejects OIDC auth when the resolved user tenant requires a missing scope', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com', scope: 'openid profile' });
      const deps = makeDeps(makeConfig({ groupSync: { forExisting: true } }));
      deps.findUser = makeFindUser(
        makeUser({
          tenantId: 'tenant-strict',
          provider: undefined,
          openidId: undefined,
          openidIssuer: undefined,
        }),
      );
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-strict'
          ? makeConfig({ scope: 'remote_agent' }, { enabled: false })
          : makeConfig({ scope: undefined }, { enabled: true }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(req as Request, res, mockNext);

      expect(deps.getAppConfig).toHaveBeenNthCalledWith(1, { baseOnly: true });
      expect(deps.getAppConfig).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tenantId: 'tenant-strict' }),
      );
      expect(jwt.verify).toHaveBeenCalledTimes(2);
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(req.user).toBeUndefined();
      expect(mockSyncUserEntraGroupMemberships).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('rejects OIDC auth when the resolved user tenant disables OIDC', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const deps = makeDeps();
      deps.findUser = makeFindUser(
        makeUser({
          tenantId: 'tenant-api-key-only',
          provider: undefined,
          openidId: undefined,
          openidIssuer: undefined,
        }),
      );
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-api-key-only'
          ? makeConfig({ enabled: false }, { enabled: true })
          : makeConfig({}, { enabled: true }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(req as Request, res, mockNext);

      expect(deps.getAppConfig).toHaveBeenNthCalledWith(1, { baseOnly: true });
      expect(deps.getAppConfig).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tenantId: 'tenant-api-key-only' }),
      );
      expect(jwt.verify).toHaveBeenCalledTimes(1);
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(req.user).toBeUndefined();
      expect(mockNext).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('allows exact and normalized configured issuers when verifying JWTs', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const issuer = `${BASE_ISSUER}/`;
      const deps = makeDeps(makeConfig({ issuer }));

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect((jwt.verify as jest.Mock).mock.calls[0][2]).toEqual(
        expect.objectContaining({ issuer: [issuer, BASE_ISSUER] }),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('accepts case-insensitive Bearer auth scheme', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const deps = makeDeps();
      const req = makeReq({ authorization: `bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith(
        FAKE_TOKEN,
        'public-key',
        expect.any(Object),
        expect.any(Function),
      );
      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@example.com' });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('trims trailing whitespace from Bearer tokens', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}   ` });

      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith(
        FAKE_TOKEN,
        'public-key',
        expect.any(Object),
        expect.any(Function),
      );
      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@example.com' });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('allows RSA, RSA-PSS, and ECDSA signing algorithms', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const deps = makeDeps();

      await createRemoteAgentAuth(asDeps(deps))(
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
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const deps = makeDeps();

      await createRemoteAgentAuth(asDeps(deps))(
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
      const payload = { sub: 'sub123', email: 'agent@example.com' };
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

      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(mockGetSigningKey).not.toHaveBeenCalled();
      expect(jwt.verify).toHaveBeenCalledTimes(2);
      expect((jwt.verify as jest.Mock).mock.calls[0][1]).toBe('first-public-key');
      expect((jwt.verify as jest.Mock).mock.calls[1][1]).toBe('second-public-key');
      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@example.com' });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('attaches federatedTokens with access_token and expires_at', async () => {
      const exp = 1234567890;
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com', exp });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect((req.user as IUser).federatedTokens).toEqual({
        access_token: FAKE_TOKEN,
        expires_at: exp,
      });
    });

    it('omits federatedTokens expires_at when exp is absent', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect((req.user as IUser).federatedTokens).toEqual({
        access_token: FAKE_TOKEN,
      });
    });

    it('hydrates a same-scope federated auth cache hit after token verification', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'cached@example.com', exp: 1234567890 });
      mockReadFederatedAuthCache.mockResolvedValueOnce({
        userId: 'cached-user-id',
        subject: 'sub123',
        issuer: BASE_ISSUER,
        email: 'cached@example.com',
        username: 'cached-user',
        name: 'Cached User',
        role: 'user',
        idOnTheSource: 'oid-cached',
        accountSyncedAt: 1710000000000,
      });
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(mockReadFederatedAuthCache).toHaveBeenCalledWith(
        {
          tenantId: undefined,
          issuer: BASE_ISSUER,
          subject: 'sub123',
        },
        { enabled: true, ttlMs: 300000 },
      );
      expect(deps.findUser).not.toHaveBeenCalled();
      expect(deps.updateUser).not.toHaveBeenCalled();
      expect(mockEnrichOpenIdProfile).not.toHaveBeenCalled();
      expect(mockSyncUserEntraGroupMemberships).not.toHaveBeenCalled();
      expect(req.user).toMatchObject({
        id: 'cached-user-id',
        email: 'cached@example.com',
        provider: 'openid',
        openidId: 'sub123',
        openidIssuer: BASE_ISSUER,
        idOnTheSource: 'oid-cached',
        federatedTokens: { access_token: FAKE_TOKEN, expires_at: 1234567890 },
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('ignores a stale federated auth cache miss and reconciles the account', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      mockReadFederatedAuthCache.mockResolvedValueOnce(null);
      const deps = makeDeps();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockEnrichOpenIdProfile).not.toHaveBeenCalled();
      expect(deps.findUser).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('does not read, write, or log federated auth cache activity when disabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const deps = makeDeps(
        makeConfig({
          federatedAuthCache: { enabled: false },
        }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(mockReadFederatedAuthCache).not.toHaveBeenCalled();
      expect(mockWriteFederatedAuthCache).not.toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Federated auth cache'),
        expect.any(Object),
      );
      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@example.com' });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('treats federated auth cache read failures as misses', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      mockReadFederatedAuthCache.mockRejectedValueOnce(new Error('redis unavailable'));
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(deps.findUser).toHaveBeenCalled();
      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@example.com' });
      expect(logger.warn).toHaveBeenCalledWith(
        '[remoteAgentAuth] Federated auth cache read failed:',
        expect.any(Error),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[remoteAgentAuth] Federated auth cache read started',
        expect.any(Object),
      );
      expect(logger.debug).not.toHaveBeenCalledWith(
        '[remoteAgentAuth] Federated auth cache read completed',
        expect.any(Object),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('writes federated auth cache after same-scope account reconciliation', async () => {
      setupOidcMocks({ sub: 'sub123', oid: 'oid123', email: 'agent@example.com' });
      const deps = makeDeps(
        makeConfig({
          federatedAuthCache: { enabled: true, ttlSeconds: 120 },
        }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockWriteFederatedAuthCache).toHaveBeenCalledWith(
        {
          tenantId: undefined,
          issuer: BASE_ISSUER,
          subject: 'sub123',
        },
        expect.objectContaining({
          userId: 'uid123',
          subject: 'sub123',
          issuer: BASE_ISSUER,
          email: 'agent@example.com',
          idOnTheSource: 'oid123',
          accountSyncedAt: expect.any(Number),
        }),
        { enabled: true, ttlMs: 120000 },
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[remoteAgentAuth] Federated auth cache write started',
        expect.objectContaining({ userId: 'uid123' }),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[remoteAgentAuth] Federated auth cache write completed',
        expect.objectContaining({ userId: 'uid123' }),
      );
    });

    it('logs only active baseline remote auth work for disabled optional features', async () => {
      setupOidcMocks({
        sub: 'sub123',
        oid: 'oid123',
        email: 'agent@example.com',
        preferred_username: 'new-agent@example.com',
        name: 'New Agent Name',
      });
      const deps = makeDeps(
        makeConfig({
          provisioning: { enabled: false },
          userInfo: { fetch: false, require: false },
          profileSync: { onCreate: true, forExisting: false },
          groupSync: { onCreate: false, forExisting: false },
          federatedAuthCache: { enabled: true, ttlSeconds: 300 },
        }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(deps.createUser).not.toHaveBeenCalled();
      expect(mockEnrichOpenIdProfile).not.toHaveBeenCalled();
      expect(mockSyncUserEntraGroupMemberships).not.toHaveBeenCalled();
      expect(deps.updateUser).toHaveBeenCalledWith(
        'uid123',
        expect.not.objectContaining({
          email: 'agent@example.com',
          username: 'new-agent@example.com',
          name: 'New Agent Name',
        }),
      );
      expect(mockWriteFederatedAuthCache).toHaveBeenCalledWith(
        expect.any(Object),
        expect.not.objectContaining({
          profileSyncedAt: expect.any(Number),
          groupsSyncedAt: expect.any(Number),
        }),
        { enabled: true, ttlMs: 300000 },
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[remoteAgentAuth] OpenID remote user resolved',
        expect.objectContaining({ lifecycle: 'existing' }),
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        '[remoteAgentAuth] OpenID remote user provisioned',
        expect.any(Object),
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Remote Entra group sync'),
        expect.any(Object),
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('OpenID userinfo fetch'),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('continues authentication when federated auth cache write fails', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      mockWriteFederatedAuthCache.mockRejectedValueOnce(new Error('redis unavailable'));
      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(mockWriteFederatedAuthCache).toHaveBeenCalled();
      expect(req.user).toMatchObject({ id: 'uid123', email: 'agent@example.com' });
      expect(logger.warn).toHaveBeenCalledWith(
        '[remoteAgentAuth] Federated auth cache write failed:',
        expect.any(Error),
      );
      expect(logger.debug).toHaveBeenCalledWith(
        '[remoteAgentAuth] Federated auth cache write started',
        expect.objectContaining({ userId: 'uid123' }),
      );
      expect(logger.debug).not.toHaveBeenCalledWith(
        '[remoteAgentAuth] Federated auth cache write completed',
        expect.any(Object),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('writes federated auth cache for request users that only have id', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      const deps = makeDeps(
        makeConfig({
          provisioning: { enabled: true },
        }),
      );
      deps.findUser.mockResolvedValue(null);
      deps.createUser.mockResolvedValue(
        makeUser({ _id: undefined as unknown as IUser['_id'], id: 'id-only-user' }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockWriteFederatedAuthCache).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ userId: 'id-only-user' }),
        expect.any(Object),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('does not write federated auth cache for no-tenant requests resolving tenant users', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com', scope: 'remote_agent' });
      const deps = makeDeps();
      deps.findUser = makeFindUser(makeUser({ tenantId: 'tenant-strict' }));
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-strict'
          ? makeConfig({ audience: 'tenant-audience', scope: 'remote_agent' }, { enabled: false })
          : makeConfig({ scope: undefined }, { enabled: true }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockWriteFederatedAuthCache).not.toHaveBeenCalled();
    });

    it('syncs remote Entra groups for an existing user when existing lifecycle sync is enabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      mockSyncUserEntraGroupMemberships.mockResolvedValueOnce({ attempted: true, synced: true });
      const deps = makeDeps(
        makeConfig({
          provisioning: { enabled: false },
          groupSync: { onCreate: false, forExisting: true },
        }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(mockSyncUserEntraGroupMemberships).toHaveBeenCalledWith(
        expect.objectContaining({
          lifecycle: 'existing',
          accessToken: FAKE_TOKEN,
          user: expect.objectContaining({ id: 'uid123', email: 'agent@example.com' }),
          graphConfig: {
            issuer: BASE_ISSUER,
            clientId: undefined,
            clientSecret: undefined,
            enabled: true,
          },
          options: expect.objectContaining({
            syncGroupsOnCreate: false,
            syncGroupsForExisting: true,
          }),
        }),
      );
      expect(req.user).toBeDefined();
      expect(logger.info).toHaveBeenCalledWith(
        '[remoteAgentAuth] Remote Entra group sync started',
        expect.objectContaining({ lifecycle: 'existing' }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[remoteAgentAuth] Remote Entra group sync completed',
        expect.objectContaining({ lifecycle: 'existing' }),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('continues authentication when remote Entra group sync reports failure', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      mockSyncUserEntraGroupMemberships.mockResolvedValueOnce({
        attempted: true,
        synced: false,
        reason: 'failed',
      });
      const deps = makeDeps(
        makeConfig({
          groupSync: { forExisting: true },
        }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(mockSyncUserEntraGroupMemberships).toHaveBeenCalled();
      expect(mockWriteFederatedAuthCache).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        '[remoteAgentAuth] Remote Entra group sync started',
        expect.objectContaining({ lifecycle: 'existing' }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        '[remoteAgentAuth] Remote Entra group sync failed',
        expect.objectContaining({ reason: 'failed' }),
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        '[remoteAgentAuth] Remote Entra group sync completed',
        expect.any(Object),
      );
      expect(req.user).toMatchObject({ id: 'uid123' });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('writes groupsSyncedAt when enabled group sync succeeds', async () => {
      const syncedAt = 1710001234567;
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      mockSyncUserEntraGroupMemberships.mockResolvedValueOnce({
        attempted: true,
        synced: true,
        syncedAt,
      });
      const deps = makeDeps(
        makeConfig({
          groupSync: { forExisting: true },
        }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockWriteFederatedAuthCache).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ groupsSyncedAt: syncedAt }),
        expect.any(Object),
      );
    });

    it('runs resolved tenant existing-user group sync inside the user tenant context', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com', scope: 'remote_agent' });
      let groupSyncTenantId: string | undefined;
      mockSyncUserEntraGroupMemberships.mockImplementationOnce(async () => {
        groupSyncTenantId = getTenantId();
        return { attempted: false, synced: false };
      });

      const deps = makeDeps();
      deps.findUser = makeFindUser(makeUser({ tenantId: 'tenant-strict' }));
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-strict'
          ? makeConfig(
              {
                audience: 'tenant-audience',
                scope: 'remote_agent',
                groupSync: { forExisting: true },
              },
              { enabled: false },
            )
          : makeConfig({ scope: undefined }, { enabled: true }),
      );

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockSyncUserEntraGroupMemberships).toHaveBeenCalledWith(
        expect.objectContaining({ lifecycle: 'existing' }),
      );
      expect(groupSyncTenantId).toBe('tenant-strict');
      expect(logger.info).toHaveBeenCalledWith(
        '[remoteAgentAuth] Remote Entra group sync skipped',
        expect.objectContaining({ lifecycle: 'existing' }),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('returns 401 when a verified token has no matching user and provisioning is disabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      deps.findUser.mockResolvedValue(null);
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(deps.createUser).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('existing_users_only'));
    });

    it('creates a missing user when remote OIDC provisioning is enabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });

      const created = makeUser({
        id: 'created-user-id',
        email: 'agent@example.com',
        openidId: 'sub123',
      });
      const deps = makeDeps(
        makeConfig(
          { provisioning: { enabled: true }, profileSync: { onCreate: true } },
          { enabled: true },
        ),
      );
      deps.findUser.mockResolvedValue(null);
      deps.createUser.mockResolvedValue(created);
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(deps.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openid',
          openidId: 'sub123',
          openidIssuer: BASE_ISSUER,
          email: 'agent@example.com',
        }),
        expect.any(Object),
        true,
        true,
      );
      expect(req.user).toMatchObject({ id: 'created-user-id', openidId: 'sub123' });
      expect((req.user as IUser).federatedTokens).toEqual({ access_token: FAKE_TOKEN });
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('uses required userinfo profile data and does not persist request tokens on create', async () => {
      process.env.OPENID_ISSUER = 'https://browser-openid.example.com';
      setupOidcMocks({
        sub: 'sub123',
        email: 'claims@example.com',
        preferred_username: 'claims-user@example.com',
      });
      mockEnrichOpenIdProfile.mockResolvedValueOnce({
        status: 'fetched',
        profile: {
          sub: 'sub123',
          email: 'userinfo@example.com',
          preferred_username: 'userinfo-user@example.com',
          given_name: 'User',
          family_name: 'Info Name',
        },
      });
      const deps = makeDeps(
        makeConfig({
          provisioning: { enabled: true },
          userInfo: { fetch: true, require: true },
        }),
      );
      deps.findUser.mockResolvedValue(null);
      deps.createUser.mockResolvedValue(
        makeUser({ id: 'created-user-id', email: 'userinfo@example.com' }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(mockEnrichOpenIdProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: FAKE_TOKEN,
          subject: 'sub123',
          fetchUserInfo: true,
          config: expect.objectContaining({
            issuer: BASE_ISSUER,
          }),
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[remoteAgentAuth] OpenID userinfo fetch started',
        expect.objectContaining({ openidId: 'sub123' }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        '[remoteAgentAuth] OpenID userinfo fetch completed',
        expect.objectContaining({ openidId: 'sub123' }),
      );
      expect(deps.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'userinfo@example.com',
          username: 'userinfo-user@example.com',
          name: 'User Info Name',
        }),
        expect.any(Object),
        true,
        true,
      );
      const createPayload = deps.createUser.mock.calls[0]![0] as unknown as Record<string, unknown>;
      expect(createPayload).toBeDefined();
      expectNoPersistedTokenFields(createPayload);
      expect(req.user).toMatchObject({
        email: 'userinfo@example.com',
        federatedTokens: { access_token: FAKE_TOKEN },
      });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('rejects required userinfo failures without API key fallback', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'claims@example.com' });
      mockEnrichOpenIdProfile.mockResolvedValueOnce({
        status: 'failed',
        profile: { sub: 'sub123', email: 'claims@example.com' },
        reason: 'service_error',
      });
      const deps = makeDeps(
        makeConfig(
          {
            provisioning: { enabled: true },
            userInfo: { fetch: true, require: true },
          },
          { enabled: true },
        ),
      );
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(deps.findUser).not.toHaveBeenCalled();
      expect(deps.createUser).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        '[remoteAgentAuth] Required OpenID userinfo rejected remote auth',
        expect.objectContaining({ reason: 'service_error' }),
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        '[remoteAgentAuth] OpenID userinfo fetch failed',
        expect.any(Object),
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('logs optional userinfo failures and continues with claims-only profile data', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'claims@example.com' });
      mockEnrichOpenIdProfile.mockResolvedValueOnce({
        status: 'failed',
        profile: { sub: 'sub123', email: 'claims@example.com' },
        reason: 'service_error',
      });
      const deps = makeDeps(
        makeConfig({
          provisioning: { enabled: true },
          userInfo: { fetch: true, require: false },
        }),
      );
      deps.findUser.mockResolvedValue(null);
      deps.createUser.mockResolvedValue(
        makeUser({ id: 'created-user-id', email: 'claims@example.com' }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        '[remoteAgentAuth] OpenID userinfo fetch failed',
        expect.objectContaining({ reason: 'service_error' }),
      );
      expect(deps.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'claims@example.com' }),
        expect.any(Object),
        true,
        true,
      );
      expect(req.user).toMatchObject({ email: 'claims@example.com' });
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('rejects disallowed domains during remote provisioning without API key fallback', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@blocked.com' });
      const config = makeConfig({ provisioning: { enabled: true } }, { enabled: true });
      config.registration = { allowedDomains: ['example.com'] } as AppConfig['registration'];
      const deps = makeDeps(config);
      deps.findUser.mockResolvedValue(null);
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(deps.createUser).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('rejects missing email during remote provisioning without API key fallback', async () => {
      setupOidcMocks({ sub: 'sub123' });
      const deps = makeDeps(makeConfig({ provisioning: { enabled: true } }, { enabled: true }));
      deps.findUser.mockResolvedValue(null);
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(deps.findUser).toHaveBeenCalled();
      expect(deps.createUser).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('applies email validation and allowed-domain checks to preferred_username fallback', async () => {
      setupOidcMocks({ sub: 'sub123', preferred_username: 'not-an-email' });
      const config = makeConfig({ provisioning: { enabled: true } }, { enabled: true });
      config.registration = { allowedDomains: ['example.com'] } as AppConfig['registration'];
      const deps = makeDeps(config);
      deps.findUser.mockResolvedValue(null);
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(deps.findUser).toHaveBeenCalled();
      expect(deps.createUser).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('applies allowed-domain checks to upn fallback email', async () => {
      setupOidcMocks({ sub: 'sub123', upn: 'agent@blocked.com' });
      const config = makeConfig({ provisioning: { enabled: true } }, { enabled: true });
      config.registration = { allowedDomains: ['example.com'] } as AppConfig['registration'];
      const deps = makeDeps(config);
      deps.findUser.mockResolvedValue(null);
      const { res, status } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(deps.createUser).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('syncs remote Entra groups with the remote issuer when create lifecycle sync is enabled', async () => {
      process.env.OPENID_ISSUER = 'https://existing-openid.example.com';
      process.env.OPENID_CLIENT_ID = 'existing-client-id';
      process.env.OPENID_CLIENT_SECRET = 'existing-client-secret';
      setupOidcMocks({ sub: 'sub123', oid: 'oid-created', email: 'agent@example.com' });

      const created = makeUser({
        id: 'created-user-id',
        email: 'agent@example.com',
        openidId: 'sub123',
        idOnTheSource: 'oid-created',
      });
      const deps = makeDeps(
        makeConfig({
          provisioning: { enabled: true },
          groupSync: { onCreate: true, forExisting: false },
        }),
      );
      deps.findUser.mockResolvedValue(null);
      deps.createUser.mockResolvedValue(created);
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(deps)(req as Request, makeRes().res, mockNext);

      expect(mockSyncUserEntraGroupMemberships).toHaveBeenCalledWith(
        expect.objectContaining({
          lifecycle: 'created',
          user: expect.objectContaining({ id: 'created-user-id', idOnTheSource: 'oid-created' }),
          accessToken: FAKE_TOKEN,
          graphConfig: {
            issuer: BASE_ISSUER,
            clientId: 'existing-client-id',
            clientSecret: 'existing-client-secret',
            enabled: true,
          },
          options: expect.objectContaining({
            syncGroupsOnCreate: true,
            syncGroupsForExisting: false,
          }),
          methods: {
            bulkUpdateGroups: deps.bulkUpdateGroups,
            findGroupsByExternalIds: deps.findGroupsByExternalIds,
            upsertGroupByExternalId: deps.upsertGroupByExternalId,
          },
        }),
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('does not sync groups for a newly created user when only existing lifecycle sync is enabled', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });

      const deps = makeDeps(
        makeConfig({
          provisioning: { enabled: true },
          groupSync: { onCreate: false, forExisting: true },
        }),
      );
      deps.findUser.mockResolvedValue(null);
      deps.createUser.mockResolvedValue(makeUser({ id: 'created-user-id', openidId: 'sub123' }));

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockSyncUserEntraGroupMemberships).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('returns 500 when enabled provisioning fails after token verification', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });

      const deps = makeDeps(makeConfig({ provisioning: { enabled: true } }, { enabled: true }));
      deps.findUser.mockResolvedValue(null);
      deps.createUser.mockRejectedValue(new Error('DB write failed'));
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

    it('returns 401 when strict tenant mode has no tenant context before account lookup', async () => {
      process.env.TENANT_ISOLATION_STRICT = 'true';
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });

      const deps = makeDeps(makeConfig({ provisioning: { enabled: true } }, { enabled: true }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(deps)(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(deps.findUser).not.toHaveBeenCalled();
      expect(deps.createUser).not.toHaveBeenCalled();
      expect(deps.updateUser).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('does not resolve a colliding legacy openidId from a different issuer', async () => {
      const issuer = 'https://issuer-b.example.com';
      setupOidcMocks({ sub: 'shared-sub', email: 'attacker@example.com' });

      const deps = makeDeps(makeConfig({ issuer }, { enabled: false }));
      deps.findUser = makeFindUser(
        makeUser({
          email: 'victim@example.com',
          openidId: 'shared-sub',
          openidIssuer: undefined,
        }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(req as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(req.user).toBeUndefined();
      expect(mockSyncUserEntraGroupMemberships).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
    });

    it('returns 401 without user lookup when sub claim is missing', async () => {
      setupOidcMocks({ email: 'agent@example.com' });

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockReadFederatedAuthCache).not.toHaveBeenCalled();
      expect(mockEnrichOpenIdProfile).not.toHaveBeenCalled();
      expect(findOpenIDUser).not.toHaveBeenCalled();
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns 401 without API key fallback when OpenID user resolution is rejected', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      deps.findUser
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeUser({ provider: 'google', openidId: undefined }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
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

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(deps.apiKeyMiddleware).toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('trying API key auth'),
        expect.any(Error),
      );
    });

    it('returns 401 when apiKey is disabled', async () => {
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('OIDC verification failed'),
        expect.any(Error),
      );
    });

    it('returns 401 when JWT cannot be decoded', async () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);
      const deps = makeDeps(makeConfig({}, { enabled: false }));
      const { res, status } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: 'Bearer not.a.jwt' }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when verifier rejects a HMAC-signed token', async () => {
      const payload = { sub: 'sub123', email: 'agent@example.com' };
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

      await createRemoteAgentAuth(asDeps(deps))(
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

      await createRemoteAgentAuth(asDeps(deps))(makeReq() as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Unexpected error'),
        expect.any(Error),
      );
    });

    it('returns 500 when findOpenIDUser throws', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });
      mockFindOpenIDUser.mockRejectedValue(new Error('DB error'));

      const deps = makeDeps(makeConfig({}, { enabled: true }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
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
          provisioning: { enabled: true },
        }),
      );

      await createRemoteAgentAuth(asDeps(deps))(
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
        makeConfig({
          jwksUri: undefined,
          issuer: 'https://issuer-env-1.example.com',
          provisioning: { enabled: true },
        }),
      );

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('rejects insecure OPENID_JWKS_URL values outside localhost', async () => {
      process.env.OPENID_JWKS_URL = 'http://env.example.com/jwks';
      const deps = makeDeps(
        makeConfig(
          { jwksUri: undefined, issuer: 'https://issuer-env-insecure.example.com' },
          { enabled: false },
        ),
      );
      const { res, status } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(jwksRsa).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('rejects insecure issuer values outside localhost before JWKS resolution', async () => {
      process.env.OPENID_JWKS_URL = 'https://env.example.com/jwks';
      const deps = makeDeps(
        makeConfig(
          { jwksUri: undefined, issuer: 'http://issuer-env-insecure.example.com' },
          { enabled: false },
        ),
      );
      const { res, status } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(jwksRsa).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('allows localhost HTTP OPENID_JWKS_URL values for development', async () => {
      process.env.OPENID_JWKS_URL = 'http://localhost:8080/jwks';
      const deps = makeDeps(
        makeConfig({
          jwksUri: undefined,
          issuer: 'http://localhost:8080/realms/test',
          provisioning: { enabled: true },
        }),
      );

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(jwksRsa).toHaveBeenCalledWith(
        expect.objectContaining({ jwksUri: 'http://localhost:8080/jwks' }),
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('fetches discovery document when jwksUri and env var are absent', async () => {
      const issuer = 'https://issuer-discovery-1.example.com';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ jwks_uri: `${issuer}/protocol/openid-connect/certs` }),
      });

      const deps = makeDeps(
        makeConfig({ jwksUri: undefined, issuer, provisioning: { enabled: true } }),
      );

      await createRemoteAgentAuth(asDeps(deps))(
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

    it('normalizes discovery document issuer URL for discovery and issuer validation', async () => {
      const issuer = 'https://issuer-discovery-url.example.com/.well-known/openid-configuration';
      const normalizedIssuer = 'https://issuer-discovery-url.example.com';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ jwks_uri: `${normalizedIssuer}/protocol/openid-connect/certs` }),
      });

      const deps = makeDeps(
        makeConfig({ jwksUri: undefined, issuer, provisioning: { enabled: true } }),
      );

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `${normalizedIssuer}/.well-known/openid-configuration`,
        expect.objectContaining({ signal: expect.any(Object) }),
      );
      expect((jwt.verify as jest.Mock).mock.calls[0][2]).toEqual(
        expect.objectContaining({ issuer: [issuer, normalizedIssuer] }),
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('rejects insecure JWKS URIs returned by discovery', async () => {
      const issuer = 'https://issuer-discovery-insecure.example.com';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ jwks_uri: 'http://issuer-discovery-insecure.example.com/jwks' }),
      });

      const deps = makeDeps(makeConfig({ jwksUri: undefined, issuer }, { enabled: false }));
      const { res, status } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(jwksRsa).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('uses a proxy dispatcher for discovery when configured', async () => {
      const proxyDispatcher = { dispatch: jest.fn() };
      mockGetEnvProxyDispatcher.mockReturnValue(proxyDispatcher);
      const issuer = 'https://issuer-proxy.example.com';

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ jwks_uri: `${issuer}/protocol/openid-connect/certs` }),
      });

      const deps = makeDeps(makeConfig({ jwksUri: undefined, issuer }));

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `${issuer}/.well-known/openid-configuration`,
        expect.objectContaining({ dispatcher: proxyDispatcher }),
      );
    });

    it('caches JWKS clients by resolved URI', async () => {
      process.env.OPENID_JWKS_URL = 'https://env-one.example.com/jwks';
      const deps = makeDeps(
        makeConfig({ jwksUri: undefined, issuer: 'https://issuer-env-cache.example.com' }),
      );

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      process.env.OPENID_JWKS_URL = 'https://env-two.example.com/jwks';

      await createRemoteAgentAuth(asDeps(deps))(
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

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      await createRemoteAgentAuth(asDeps(deps))(
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

        await createRemoteAgentAuth(asDeps(deps))(
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

        await createRemoteAgentAuth(asDeps(deps))(
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
        const request = createRemoteAgentAuth(asDeps(deps))(
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

      await createRemoteAgentAuth(asDeps(deps))(
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

      await createRemoteAgentAuth(asDeps(deps))(
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
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeUser({ email: getOpenIdEmail(claims), openidId: claims.sub }));
      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      return deps.findUser.mock.calls
        .map(([query]) => query as { email?: string })
        .find((query) => query.email)?.email;
    }

    it('uses email claim', async () => {
      expect(await captureEmailArg({ sub: 's1', email: 'user@example.com' })).toBe(
        'user@example.com',
      );
    });

    it('falls back to preferred_username when email is absent', async () => {
      expect(
        await captureEmailArg({ sub: 's2', preferred_username: 'agent-user@example.com' }),
      ).toBe('agent-user@example.com');
    });

    it('falls back to preferred_username when email is empty', async () => {
      expect(
        await captureEmailArg({
          sub: 's2-empty',
          email: '',
          preferred_username: 'agent-user@example.com',
        }),
      ).toBe('agent-user@example.com');
    });

    it('falls back to upn when email and preferred_username are absent', async () => {
      expect(await captureEmailArg({ sub: 's3', upn: 'upn@corp.com' })).toBe('upn@corp.com');
    });

    it('uses OPENID_EMAIL_CLAIM when configured', async () => {
      process.env.OPENID_EMAIL_CLAIM = 'custom_identifier';

      expect(
        await captureEmailArg({
          sub: 's4',
          email: 'user@example.com',
          custom_identifier: 'agent@corp.example.com',
        }),
      ).toBe('agent@corp.example.com');
    });
  });

  describe('update user and migration scenarios', () => {
    it('persists openidId binding when migration is needed', async () => {
      const updatedUser = makeUser({
        email: 'existing@test.com',
        openidId: 'sub-new',
        openidIssuer: BASE_ISSUER,
      });
      const mockUpdateUser = jest.fn().mockResolvedValue(updatedUser);
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
      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockUpdateUser).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          provider: 'openid',
          openidId: 'sub-new',
          openidIssuer: BASE_ISSUER,
        }),
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

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(deps.apiKeyMiddleware).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('persists OpenID security fields for existing users', async () => {
      const mockUpdateUser = jest.fn(async (_userId, update) => makeUser(update as Partial<IUser>));
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });

      const deps = { ...makeDeps(), updateUser: mockUpdateUser };
      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockUpdateUser).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          provider: 'openid',
          openidId: 'sub123',
          openidIssuer: BASE_ISSUER,
        }),
      );
      const updatePayload = mockUpdateUser.mock.calls[0]![1] as Record<string, unknown>;
      expectNoPersistedTokenFields(updatePayload);
    });
  });

  describe('OpenID role sync', () => {
    function expectNoRoleUpdate(updateUser: jest.MockedFunction<UserMethods['updateUser']>) {
      const hasRoleUpdate = updateUser.mock.calls.some(([_userId, update]) =>
        Object.prototype.hasOwnProperty.call(update, 'role'),
      );
      expect(hasRoleUpdate).toBe(false);
    }

    function enableApiRoleSync(overrides: Record<string, string> = {}) {
      process.env.OPENID_ROLE_SYNC_ENABLED = 'true';
      process.env.OPENID_ROLE_SYNC_API_ENABLED = 'true';
      process.env.OPENID_ROLE_SYNC_SOURCE = 'access';
      process.env.OPENID_ROLE_SYNC_CLAIM = 'roles';
      process.env.OPENID_ROLE_SYNC_ROLE_PRIORITY = 'STANDARD-USER,BASIC-USER';
      process.env.OPENID_ROLE_SYNC_FALLBACK_ROLE = 'USER';

      for (const [key, value] of Object.entries(overrides)) {
        process.env[key] = value;
      }
    }

    it('does not run unless API role sync is explicitly enabled', async () => {
      process.env.OPENID_ROLE_SYNC_ENABLED = 'true';
      process.env.OPENID_ROLE_SYNC_SOURCE = 'access';
      process.env.OPENID_ROLE_SYNC_CLAIM = 'roles';
      process.env.OPENID_ROLE_SYNC_ROLE_PRIORITY = 'STANDARD-USER';
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', roles: ['STANDARD-USER'] });

      const deps = makeDeps();
      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(deps.getRolesByNames).not.toHaveBeenCalled();
      expectNoRoleUpdate(deps.updateUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('selects the highest configured matching role from the verified bearer payload', async () => {
      enableApiRoleSync();
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        roles: ['BASIC-USER', 'STANDARD-USER'],
      });

      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(deps.updateUser).toHaveBeenCalledWith('uid123', { role: 'STANDARD-USER' });
      expect(req.user).toMatchObject({ role: 'STANDARD-USER' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('applies fallback when the verified payload has no configured role match', async () => {
      enableApiRoleSync();
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        roles: ['external-role'],
      });

      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(deps.updateUser).toHaveBeenCalledWith('uid123', { role: 'USER' });
      expect(req.user).toMatchObject({ role: 'USER' });
    });

    it('applies fallback when the role claim is present but empty', async () => {
      enableApiRoleSync();
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        roles: '',
      });

      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(deps.updateUser).toHaveBeenCalledWith('uid123', { role: 'USER' });
      expect(req.user).toMatchObject({ role: 'USER' });
    });

    it('preserves an existing ADMIN role because generic role sync cannot manage admin', async () => {
      enableApiRoleSync();
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        roles: ['STANDARD-USER'],
      });

      const deps = makeDeps();
      const adminUser = makeUser({ role: SystemRoles.ADMIN });
      deps.findUser = makeFindUser(adminUser);
      deps.updateUser.mockImplementation(async (_userId, update) =>
        makeUser({ ...adminUser, ...(update as Partial<IUser>) }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(deps.getRolesByNames).not.toHaveBeenCalled();
      expectNoRoleUpdate(deps.updateUser);
      expect(req.user).toMatchObject({ role: SystemRoles.ADMIN });
    });

    it('leaves the role unchanged when the configured source is unavailable to API auth', async () => {
      enableApiRoleSync({ OPENID_ROLE_SYNC_SOURCE: 'id' });
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', roles: ['STANDARD-USER'] });

      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(deps.getRolesByNames).not.toHaveBeenCalled();
      expectNoRoleUpdate(deps.updateUser);
      expect(req.user).toMatchObject({ role: 'user' });
    });

    it('does not apply fallback when API group overage is unresolved', async () => {
      enableApiRoleSync({ OPENID_ROLE_SYNC_CLAIM: 'groups' });
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@test.com',
        hasgroups: true,
      });

      const deps = makeDeps();
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expectNoRoleUpdate(deps.updateUser);
      expect(req.user).toMatchObject({ role: 'user' });
    });

    it('runs role lookup and persistence in the resolved user tenant context', async () => {
      enableApiRoleSync();
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', roles: ['BASIC-USER'] });

      const deps = makeDeps();
      deps.findUser = makeFindUser(makeUser({ tenantId: 'tenant-role-sync' }));
      deps.getAppConfig.mockImplementation(async (options) =>
        options?.tenantId === 'tenant-role-sync'
          ? makeConfig({ scope: undefined }, { enabled: false })
          : makeConfig({ scope: undefined }, { enabled: true }),
      );
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });

      await createRemoteAgentAuth(asDeps(deps))(req as Request, makeRes().res, mockNext);

      expect(deps.getRolesByNames).toHaveBeenCalledWith(
        ['STANDARD-USER', 'BASIC-USER', 'USER'],
        'name',
      );
      expect(deps.updateUser).toHaveBeenCalledWith('uid123', { role: 'BASIC-USER' });
      expect(req.user).toMatchObject({ tenantId: 'tenant-role-sync', role: 'BASIC-USER' });
    });

    it('re-checks resolved user policy after role sync changes the role', async () => {
      enableApiRoleSync();
      setupOidcMocks({ sub: 'sub123', email: 'agent@test.com', roles: ['STANDARD-USER'] });

      const deps = makeDeps();
      deps.findUser = makeFindUser(makeUser({ tenantId: 'tenant-role-sync', role: 'BASIC-USER' }));
      deps.getAppConfig.mockImplementation(async (options) => {
        if (options?.tenantId !== 'tenant-role-sync') {
          return makeConfig({ scope: undefined }, { enabled: true });
        }

        return options.role === 'STANDARD-USER'
          ? makeConfig({ enabled: false }, { enabled: false })
          : makeConfig({ scope: undefined }, { enabled: false });
      });
      const req = makeReq({ authorization: `Bearer ${FAKE_TOKEN}` });
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(req as Request, res, mockNext);

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expectNoRoleUpdate(deps.updateUser);
      expect(req.user).toBeUndefined();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('scope validation', () => {
    it('returns 401 when required scope is missing from token', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com', scope: 'openid profile' });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent' }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('does not fall back to apiKeyMiddleware when a verified token is missing scope', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com', scope: 'openid profile' });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent' }, { enabled: true }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
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
        email: 'agent@example.com',
        scope: 'openid profile remote_agent',
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent' }));
      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('passes when scp is an array containing the required scope', async () => {
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@example.com',
        scp: ['openid', 'remote_agent'],
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent' }));
      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('passes when all configured scopes are present', async () => {
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@example.com',
        scp: ['openid', 'remote_agent', 'admin'],
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent admin' }));
      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('returns 401 when any configured scope is missing', async () => {
      setupOidcMocks({
        sub: 'sub123',
        email: 'agent@example.com',
        scp: ['openid', 'remote_agent'],
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent admin' }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
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
        email: 'agent@example.com',
        scope: 'remote_agent admin',
      });

      const deps = makeDeps(makeConfig({ scope: 'remote_agent,admin' }, { enabled: false }));
      const { res, status, json } = makeRes();

      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        res,
        mockNext,
      );

      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('passes when scope is not configured (backward compat)', async () => {
      setupOidcMocks({ sub: 'sub123', email: 'agent@example.com' });

      const deps = makeDeps(makeConfig({ scope: undefined }));
      await createRemoteAgentAuth(asDeps(deps))(
        makeReq({ authorization: `Bearer ${FAKE_TOKEN}` }) as Request,
        makeRes().res,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
