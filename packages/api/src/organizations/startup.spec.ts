import type { AppConfig } from '@librechat/data-schemas';
import { configureOrganizations, getOrganizationsConfig, isOrganizationsEnabled } from './mode';
import { assertOrganizationsRuntime, findOrganizationsRuntimeConflicts } from './startup';

type RuntimeConfig = Pick<AppConfig, 'organizations' | 'endpoints'>;

const SAFE_ENV = { TENANT_ISOLATION_STRICT: 'true' };

function enabledConfig(extra: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return {
    organizations: {
      enabled: true,
      allowCreate: true,
      maxPerAccount: 10,
      invites: {
        emailExpiryHours: 168,
        linkExpiryHours: 168,
        allowLinkInvites: true,
        defaultMaxLinkUses: 25,
      },
      adminCapabilities: ['manage:users'],
    },
    ...extra,
  };
}

describe('findOrganizationsRuntimeConflicts', () => {
  it('reports nothing when organizations are disabled, whatever the environment', () => {
    expect(
      findOrganizationsRuntimeConflicts(
        {},
        { TRUST_TENANT_HEADER: 'true', ALLOW_SOCIAL_LOGIN: 'true' },
      ),
    ).toEqual([]);
  });

  it('accepts a strict, header-free, password-only deployment', () => {
    expect(findOrganizationsRuntimeConflicts(enabledConfig(), SAFE_ENV)).toEqual([]);
  });

  it('requires strict tenant isolation', () => {
    const conflicts = findOrganizationsRuntimeConflicts(enabledConfig(), {});
    expect(conflicts).toEqual([expect.stringContaining('TENANT_ISOLATION_STRICT')]);
  });

  it.each([
    ['TRUST_TENANT_HEADER', { TRUST_TENANT_HEADER: 'true' }],
    ['OPENID_REUSE_TOKENS', { OPENID_REUSE_TOKENS: 'true' }],
    ['ALLOW_SOCIAL_LOGIN', { ALLOW_SOCIAL_LOGIN: 'true' }],
    ['LDAP', { LDAP_URL: 'ldap://example', LDAP_USER_SEARCH_BASE: 'dc=example' }],
  ])('rejects %s', (setting, env) => {
    const conflicts = findOrganizationsRuntimeConflicts(enabledConfig(), { ...SAFE_ENV, ...env });
    expect(conflicts).toEqual([expect.stringContaining(setting)]);
  });

  it('rejects remote agent OIDC bearers', () => {
    const config = enabledConfig({
      endpoints: { agents: { remoteApi: { auth: { oidc: { enabled: true } } } } },
    } as Partial<RuntimeConfig>);
    expect(findOrganizationsRuntimeConflicts(config, SAFE_ENV)).toEqual([
      expect.stringContaining('remoteApi.auth.oidc'),
    ]);
  });

  it('lists every conflict at once', () => {
    const conflicts = findOrganizationsRuntimeConflicts(enabledConfig(), {
      TRUST_TENANT_HEADER: 'true',
      ALLOW_SOCIAL_LOGIN: 'true',
    });
    expect(conflicts).toHaveLength(3);
  });
});

describe('assertOrganizationsRuntime', () => {
  it('throws with every conflict named', () => {
    expect(() =>
      assertOrganizationsRuntime(enabledConfig(), { TRUST_TENANT_HEADER: 'true' }),
    ).toThrow(/TENANT_ISOLATION_STRICT[\s\S]*TRUST_TENANT_HEADER/);
  });

  it('passes a safe deployment', () => {
    expect(() => assertOrganizationsRuntime(enabledConfig(), SAFE_ENV)).not.toThrow();
  });
});

describe('configureOrganizations', () => {
  afterEach(() => configureOrganizations(undefined));

  it('defaults to disabled', () => {
    configureOrganizations(undefined);
    expect(isOrganizationsEnabled()).toBe(false);
    expect(getOrganizationsConfig().maxPerAccount).toBe(10);
  });

  it('applies the base config section with defaults filled in', () => {
    configureOrganizations({ enabled: true, maxPerAccount: 3 });
    expect(isOrganizationsEnabled()).toBe(true);
    expect(getOrganizationsConfig()).toMatchObject({
      maxPerAccount: 3,
      allowCreate: true,
      invites: { allowLinkInvites: true, emailExpiryHours: 168 },
    });
    expect(getOrganizationsConfig().adminCapabilities).toContain('manage:users');
  });
});
