import {
  configSchema,
  organizationsConfigSchema,
  BASE_ONLY_CONFIG_SECTIONS,
  organizationAdminCapabilities,
} from '../src/config';

describe('organizationsConfigSchema', () => {
  it('defaults to disabled, which keeps single-tenant behavior', () => {
    const parsed = organizationsConfigSchema.parse(undefined);
    expect(parsed).toEqual({
      enabled: false,
      allowCreate: true,
      maxPerAccount: 10,
      invites: {
        emailExpiryHours: 168,
        linkExpiryHours: 168,
        allowLinkInvites: true,
        defaultMaxLinkUses: 25,
      },
      adminCapabilities: expect.arrayContaining(['manage:users', 'manage:roles']),
    });
  });

  it('keeps platform-managed capabilities out of the default admin grants', () => {
    const { adminCapabilities } = organizationsConfigSchema.parse({});
    expect(adminCapabilities).not.toContain('manage:configs');
    expect(adminCapabilities).not.toContain('access:admin');
    expect(adminCapabilities.every((cap) => organizationAdminCapabilities.includes(cap))).toBe(
      true,
    );
  });

  it.each([
    'manage:configs',
    'manage:configs:endpoints',
    'assign:configs',
    'manage:mcpservers',
    'manage:code_environments',
    'access:admin',
  ])('rejects %s as an organization admin capability', (capability) => {
    const result = organizationsConfigSchema.safeParse({ adminCapabilities: [capability] });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys and out-of-range limits', () => {
    expect(organizationsConfigSchema.safeParse({ enabeld: true }).success).toBe(false);
    expect(organizationsConfigSchema.safeParse({ maxPerAccount: 0 }).success).toBe(false);
    expect(
      organizationsConfigSchema.safeParse({ invites: { emailExpiryHours: 24 * 31 } }).success,
    ).toBe(false);
  });

  it('is part of the YAML config and fills its defaults there', () => {
    const parsed = configSchema.parse({ version: '1.0.0', organizations: { enabled: true } });
    expect(parsed.organizations).toMatchObject({ enabled: true, maxPerAccount: 10 });
  });

  it('is a base-only section, so no tenant config document can change it', () => {
    expect(BASE_ONLY_CONFIG_SECTIONS).toContain('organizations');
  });
});
