import type { AppConfig } from '@librechat/data-schemas';
import type { UnattendedOpenIDTokenDeps } from './upstream';
import type { ScheduledTokenIdentity } from './mcp';
import {
  UNATTENDED_OPENID_TOKEN_IDENTIFIER,
  UNATTENDED_OPENID_TOKEN_TYPE,
  createHostUpstreamTokenProviderResolver,
  isUnattendedOpenIDTokensEnabled,
  persistUnattendedOpenIDTokens,
} from './upstream';
import { OpenIDReauthRequiredError } from '../utils/oidc';

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
  encryptV2: jest.fn(async (value: string) => `encrypted:${value}`),
  decryptV2: jest.fn(async (value: string) => value.replace(/^encrypted:/, '')),
  getTenantId: jest.fn(),
}));

jest.mock('../auth/refresh', () => ({
  buildOpenIDRefreshParams: jest.fn(() => ({ scope: 'openid offline_access' })),
}));

const principal: ScheduledTokenIdentity = {
  id: 'owner',
  provider: 'openid',
  openidId: 'sub-1',
  openidIssuer: 'https://issuer.example.test',
  tenantId: 'tenant',
  role: 'USER',
};

const enabledConfig = {
  interfaceConfig: { schedules: { use: true, unattendedOpenIDTokens: true } },
} as AppConfig;

function createDeps(overrides: Partial<UnattendedOpenIDTokenDeps> = {}): UnattendedOpenIDTokenDeps {
  return {
    findToken: jest.fn().mockResolvedValue(null),
    updateToken: jest.fn().mockResolvedValue({}),
    createToken: jest.fn().mockResolvedValue({}),
    deleteTokens: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    getAppConfig: jest.fn().mockResolvedValue(enabledConfig),
    getOpenIdConfig: jest.fn().mockReturnValue({ issuer: 'https://issuer.example.test' }),
    refreshTokenGrant: jest.fn().mockResolvedValue({
      access_token: 'fresh-access',
      refresh_token: 'fresh-refresh',
      expires_in: 3600,
    }),
    ...overrides,
  };
}

function storedRecord(tokens: {
  refresh_token: string;
  access_token?: string;
  id_token?: string;
  expires_at?: number;
}) {
  return {
    token: `encrypted:${JSON.stringify(tokens)}`,
    metadata: {
      openidSubject: principal.openidId,
      openidIssuer: principal.openidIssuer,
      tenantId: principal.tenantId,
    },
  };
}

describe('unattended OpenID schedule tokens', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, OPENID_REUSE_TOKENS: 'true' };
  });

  afterAll(() => {
    process.env = env;
  });

  it('ignores persist when the schedule toggle is off', async () => {
    const deps = createDeps({
      getAppConfig: jest.fn().mockResolvedValue({
        interfaceConfig: { schedules: { use: true } },
      }),
    });
    await persistUnattendedOpenIDTokens(deps, principal, { refresh_token: 'rt' });
    expect(deps.createToken).not.toHaveBeenCalled();
    expect(deps.updateToken).not.toHaveBeenCalled();
  });

  it('persists an encrypted refresh token for the owning user', async () => {
    const deps = createDeps();
    await persistUnattendedOpenIDTokens(deps, principal, {
      refresh_token: 'rt-1',
      access_token: 'at-1',
      expires_at: 1_700_000_000,
    });
    expect(deps.createToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner',
        type: UNATTENDED_OPENID_TOKEN_TYPE,
        identifier: UNATTENDED_OPENID_TOKEN_IDENTIFIER,
        token: expect.stringMatching(/^encrypted:/),
        metadata: {
          openidSubject: 'sub-1',
          openidIssuer: 'https://issuer.example.test',
          tenantId: 'tenant',
        },
      }),
    );
  });

  it('updates an existing unattended token row on rotation', async () => {
    const deps = createDeps({
      findToken: jest.fn().mockResolvedValue(storedRecord({ refresh_token: 'rt-old' })),
    });
    await persistUnattendedOpenIDTokens(deps, principal, { refresh_token: 'rt-new' });
    expect(deps.createToken).not.toHaveBeenCalled();
    expect(deps.updateToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'owner',
        type: UNATTENDED_OPENID_TOKEN_TYPE,
        identifier: UNATTENDED_OPENID_TOKEN_IDENTIFIER,
      }),
      expect.objectContaining({ token: expect.stringMatching(/^encrypted:/) }),
    );
  });

  it('does not install a provider when token reuse is disabled', async () => {
    process.env.OPENID_REUSE_TOKENS = 'false';
    const deps = createDeps();
    const resolve = createHostUpstreamTokenProviderResolver(deps);
    await expect(resolve(principal, {})).resolves.toBeUndefined();
    expect(deps.getAppConfig).not.toHaveBeenCalled();
  });

  it('does not install a provider when unattended tokens are disabled', async () => {
    const deps = createDeps({
      getAppConfig: jest.fn().mockResolvedValue({
        interfaceConfig: { schedules: { use: true } },
      }),
    });
    const resolve = createHostUpstreamTokenProviderResolver(deps);
    await expect(resolve(principal, {})).resolves.toBeUndefined();
    expect(deps.findToken).not.toHaveBeenCalled();
  });

  it('reuses a still-fresh stored access token without contacting the IdP', async () => {
    const deps = createDeps({
      findToken: jest.fn().mockResolvedValue(
        storedRecord({
          refresh_token: 'rt-live',
          access_token: 'at-live',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }),
      ),
    });
    const provider = await createHostUpstreamTokenProviderResolver(deps)(principal, {});
    await expect(provider?.()).resolves.toEqual(
      expect.objectContaining({ access_token: 'at-live', refresh_token: 'rt-live' }),
    );
    expect(deps.refreshTokenGrant).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and stores the rotated credential', async () => {
    const deps = createDeps({
      findToken: jest
        .fn()
        .mockResolvedValueOnce(
          storedRecord({
            refresh_token: 'rt-stale',
            access_token: 'at-stale',
            expires_at: Math.floor(Date.now() / 1000) - 10,
          }),
        )
        .mockResolvedValueOnce(
          storedRecord({
            refresh_token: 'rt-stale',
            access_token: 'at-stale',
            expires_at: Math.floor(Date.now() / 1000) - 10,
          }),
        ),
    });
    const provider = await createHostUpstreamTokenProviderResolver(deps)(principal, {});
    await expect(provider?.()).resolves.toEqual(
      expect.objectContaining({ access_token: 'fresh-access', refresh_token: 'fresh-refresh' }),
    );
    expect(deps.refreshTokenGrant).toHaveBeenCalledWith(
      { issuer: 'https://issuer.example.test' },
      'rt-stale',
      { scope: 'openid offline_access' },
    );
    expect(deps.updateToken).toHaveBeenCalled();
  });

  it('reports reauth when no durable refresh token has been stored', async () => {
    const deps = createDeps();
    const provider = await createHostUpstreamTokenProviderResolver(deps)(principal, {});
    await expect(provider?.()).rejects.toBeInstanceOf(OpenIDReauthRequiredError);
  });

  it('drops a rejected refresh token and reports reauth', async () => {
    const deps = createDeps({
      findToken: jest.fn().mockResolvedValue(storedRecord({ refresh_token: 'rt-revoked' })),
      refreshTokenGrant: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('denied'), { error: 'invalid_grant' })),
    });
    const provider = await createHostUpstreamTokenProviderResolver(deps)(principal, {});
    await expect(provider?.()).rejects.toBeInstanceOf(OpenIDReauthRequiredError);
    expect(deps.deleteTokens).toHaveBeenCalledWith({
      userId: 'owner',
      type: UNATTENDED_OPENID_TOKEN_TYPE,
      identifier: UNATTENDED_OPENID_TOKEN_IDENTIFIER,
    });
  });

  it('does not treat a stored-token identity mismatch as the current owner', async () => {
    const deps = createDeps({
      findToken: jest.fn().mockResolvedValue({
        token: `encrypted:${JSON.stringify({ refresh_token: 'rt-other' })}`,
        metadata: { openidSubject: 'someone-else' },
      }),
    });
    const provider = await createHostUpstreamTokenProviderResolver(deps)(principal, {});
    await expect(provider?.()).rejects.toBeInstanceOf(OpenIDReauthRequiredError);
    expect(deps.refreshTokenGrant).not.toHaveBeenCalled();
  });

  it('leaves boolean schedule enablement fail-closed', () => {
    expect(
      isUnattendedOpenIDTokensEnabled({ interfaceConfig: { schedules: true } } as AppConfig),
    ).toBe(false);
    expect(
      isUnattendedOpenIDTokensEnabled({
        interfaceConfig: { schedules: { use: true, unattendedOpenIDTokens: true } },
      } as AppConfig),
    ).toBe(true);
  });
});
