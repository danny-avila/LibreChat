import { Types } from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import type { IUser, AppConfig, UserMethods } from '@librechat/data-schemas';

import {
  normalizeOpenIdProfile,
  resolveOpenIdAccount,
  type OpenIdAccountInput,
  type OpenIdAccountMethods,
  type OpenIdAccountOptions,
} from './openidAccount';

const baseOptions: OpenIdAccountOptions = {
  allowUserCreation: true,
  syncProfileOnCreate: true,
  syncProfileForExisting: false,
};

const appConfig = {
  registration: {
    allowedDomains: ['example.com'],
  },
} as AppConfig;

function user(overrides: Partial<IUser> = {}): IUser {
  const _id = overrides._id ?? new Types.ObjectId();
  return {
    _id,
    id: _id.toString(),
    email: 'user@example.com',
    emailVerified: true,
    provider: 'openid',
    openidId: 'sub-123',
    openidIssuer: 'https://issuer.example.com',
    role: SystemRoles.USER,
    ...overrides,
  } as IUser;
}

function duplicateKeyError(): Error & { code: number } {
  const error = new Error('duplicate key') as Error & { code: number };
  error.code = 11000;
  return error;
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

function mockFindUser(
  implementation: UserMethods['findUser'] = async () => null,
): jest.MockedFunction<UserMethods['findUser']> {
  return mockMethod<UserMethods['findUser']>(implementation);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSubjectLookup(query: unknown): boolean {
  if (!isRecord(query)) return false;
  if (query.openidId === 'sub-123' && query.openidIssuer === 'https://issuer.example.com') {
    return true;
  }

  const orConditions = query.$or;
  return (
    Array.isArray(orConditions) && orConditions.some((condition) => isSubjectLookup(condition))
  );
}

function expectSubjectLookup(findUser: UserMethods['findUser']) {
  const mockFindUser = findUser as jest.MockedFunction<UserMethods['findUser']>;
  expect(mockFindUser.mock.calls.some(([query]) => isSubjectLookup(query))).toBe(true);
}

function mockCreateUser(
  implementation: UserMethods['createUser'] = async () => user(),
): jest.MockedFunction<UserMethods['createUser']> {
  return mockMethod<UserMethods['createUser']>(implementation);
}

function mockUpdateUser(
  implementation: UserMethods['updateUser'] = async (_userId, update) =>
    user({ ...(update as Partial<IUser>) }),
): jest.MockedFunction<UserMethods['updateUser']> {
  return mockMethod<UserMethods['updateUser']>(implementation);
}

function methods(overrides: Partial<OpenIdAccountMethods> = {}): OpenIdAccountMethods {
  return {
    findUser: mockFindUser(),
    createUser: mockCreateUser(),
    updateUser: mockUpdateUser(),
    ...overrides,
  };
}

function input(overrides: Partial<OpenIdAccountInput> = {}): OpenIdAccountInput {
  return {
    claims: {
      sub: 'sub-123',
      email: 'claims@example.com',
      preferred_username: 'claims-user',
      email_verified: false,
    },
    profile: {
      email: 'user@example.com',
      preferred_username: 'profile-user',
      given_name: 'Profile',
      family_name: 'User',
      email_verified: true,
      oid: 'oid-123',
    },
    issuer: 'https://issuer.example.com/',
    appConfig,
    options: baseOptions,
    methods: methods(),
    ...overrides,
  };
}

describe('normalizeOpenIdProfile', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('merges profile over claims and normalizes browser-compatible fields', () => {
    const normalized = normalizeOpenIdProfile({
      claims: {
        sub: 'sub-123',
        email: 'claims@example.com',
        preferred_username: 'claims-user',
        email_verified: false,
      },
      profile: {
        email: 'USER@EXAMPLE.COM',
        preferred_username: 'profile-user',
        name: 'Profile User',
        given_name: 'Profile',
        family_name: 'User',
        oid: 'oid-123',
        email_verified: true,
      },
      issuer: 'https://issuer.example.com/.well-known/openid-configuration',
    });

    expect(normalized).toEqual({
      subject: 'sub-123',
      issuer: 'https://issuer.example.com',
      idOnTheSource: 'oid-123',
      email: 'user@example.com',
      username: 'profile-user',
      name: 'Profile User',
      emailVerified: true,
    });
  });

  it('honors browser OpenID username and name claim overrides', () => {
    process.env.OPENID_USERNAME_CLAIM = 'custom_username';
    process.env.OPENID_NAME_CLAIM = 'custom_name';

    const normalized = normalizeOpenIdProfile({
      claims: {
        sub: 'sub-123',
        email: 'user@example.com',
        preferred_username: 'preferred-user',
        name: 'Default Name',
        custom_username: 'custom-user',
        custom_name: 'Custom Name',
      },
    });

    expect(normalized).toMatchObject({
      username: 'custom-user',
      name: 'Custom Name',
    });
  });

  it('does not use the name claim unless OPENID_NAME_CLAIM selects it', () => {
    delete process.env.OPENID_NAME_CLAIM;

    const normalized = normalizeOpenIdProfile({
      claims: {
        sub: 'sub-123',
        preferred_username: 'preferred-user',
        name: 'Default Name',
      },
    });

    expect(normalized.name).toBeUndefined();
  });
});

describe('resolveOpenIdAccount', () => {
  it('rejects missing subject before user lookup', async () => {
    const deps = methods();
    const result = await resolveOpenIdAccount(
      input({ claims: { email: 'user@example.com' }, methods: deps }),
    );

    expect(result).toEqual({ status: 'unauthorized', reason: 'missing_sub' });
    expect(deps.findUser).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid email when no existing OpenID user matches', async () => {
    const deps = methods();
    const result = await resolveOpenIdAccount(
      input({
        claims: { sub: 'sub-123', email: 'not-an-email' },
        profile: undefined,
        methods: deps,
      }),
    );

    expect(result).toEqual({ status: 'unauthorized', reason: 'missing_email' });
    expectSubjectLookup(deps.findUser);
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('rejects disallowed email domains before email fallback or provisioning', async () => {
    const deps = methods();
    const result = await resolveOpenIdAccount(
      input({
        claims: { sub: 'sub-123', email: 'user@blocked.com' },
        profile: undefined,
        methods: deps,
      }),
    );

    expect(result).toEqual({ status: 'unauthorized', reason: 'email_domain_not_allowed' });
    expect(deps.findUser).toHaveBeenCalledTimes(1);
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('resolves an existing OpenID user without an email claim', async () => {
    const existing = user();
    const deps = methods({
      findUser: mockFindUser(async () => existing),
      updateUser: mockUpdateUser(async (_userId, update) =>
        user({ ...existing, ...(update as Partial<IUser>) }),
      ),
    });

    const result = await resolveOpenIdAccount(
      input({
        claims: { sub: 'sub-123' },
        profile: undefined,
        options: { ...baseOptions, syncProfileForExisting: true },
        methods: deps,
      }),
    );

    expect(result).toMatchObject({ status: 'resolved', created: false });
    expect(deps.updateUser).toHaveBeenCalledWith(
      existing._id.toString(),
      expect.not.objectContaining({
        email: expect.any(String),
        emailVerified: expect.any(Boolean),
      }),
    );
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it('does not write a disallowed email claim for an existing OpenID user', async () => {
    const existing = user();
    const deps = methods({
      findUser: mockFindUser(async () => existing),
      updateUser: mockUpdateUser(async (_userId, update) =>
        user({ ...existing, ...(update as Partial<IUser>) }),
      ),
    });

    const result = await resolveOpenIdAccount(
      input({
        claims: { sub: 'sub-123', email: 'user@blocked.com' },
        profile: undefined,
        options: { ...baseOptions, syncProfileForExisting: true },
        methods: deps,
      }),
    );

    expect(result).toMatchObject({ status: 'resolved', created: false });
    expect(deps.updateUser).toHaveBeenCalledWith(
      existing._id.toString(),
      expect.not.objectContaining({ email: 'user@blocked.com' }),
    );
  });

  it('creates a missing user with required identity fields and optional profile fields', async () => {
    const created = user({
      username: 'profile-user',
      name: 'Profile User',
      idOnTheSource: 'oid-123',
    });
    const deps = methods({
      createUser: mockCreateUser(async () => created),
    });

    const result = await resolveOpenIdAccount(input({ tenantId: 'tenant-a', methods: deps }));

    expect(result).toMatchObject({ status: 'resolved', created: true, user: { id: created.id } });
    expect(deps.createUser).toHaveBeenCalledWith(
      {
        provider: 'openid',
        openidId: 'sub-123',
        openidIssuer: 'https://issuer.example.com',
        idOnTheSource: 'oid-123',
        email: 'user@example.com',
        role: SystemRoles.USER,
        tenantId: 'tenant-a',
        username: 'profile-user',
        name: 'Profile User',
        emailVerified: true,
      },
      expect.any(Object),
      true,
      true,
    );
  });

  it('uses base-config provisioning without tenant context', async () => {
    const deps = methods();

    const result = await resolveOpenIdAccount(input({ methods: deps }));

    expect(result).toMatchObject({ status: 'resolved', created: true });
    expect(deps.createUser).toHaveBeenCalledWith(
      expect.not.objectContaining({ tenantId: expect.any(String) }),
      expect.any(Object),
      true,
      true,
    );
  });

  it('does not write optional create profile fields when create profile sync is disabled', async () => {
    const deps = methods();

    await resolveOpenIdAccount(
      input({
        options: { ...baseOptions, syncProfileOnCreate: false },
        methods: deps,
      }),
    );

    expect(deps.createUser).toHaveBeenCalledWith(
      expect.not.objectContaining({
        username: expect.any(String),
        name: expect.any(String),
        emailVerified: expect.any(Boolean),
      }),
      expect.any(Object),
      true,
      true,
    );
  });

  it('returns existing-users-only when creation is disabled for missing users', async () => {
    const result = await resolveOpenIdAccount(
      input({
        options: { ...baseOptions, allowUserCreation: false },
      }),
    );

    expect(result).toEqual({ status: 'unauthorized', reason: 'existing_users_only' });
  });

  it('persists security migrations for existing users even when profile sync is disabled', async () => {
    const existing = user({
      provider: '',
      openidId: undefined,
      openidIssuer: undefined,
      role: undefined,
      username: 'old-user',
      name: 'Old User',
    });
    const updated = user({
      ...existing,
      provider: 'openid',
      openidId: 'sub-123',
      openidIssuer: 'https://issuer.example.com',
      idOnTheSource: 'oid-123',
      role: SystemRoles.USER,
    });
    const deps = methods({
      findUser: mockFindUser().mockResolvedValueOnce(null).mockResolvedValueOnce(existing),
      updateUser: mockUpdateUser(async () => updated),
    });

    const result = await resolveOpenIdAccount(input({ methods: deps }));

    expect(result).toMatchObject({ status: 'resolved', created: false });
    expect(deps.updateUser).toHaveBeenCalledWith(existing._id.toString(), {
      provider: 'openid',
      openidId: 'sub-123',
      openidIssuer: 'https://issuer.example.com',
      idOnTheSource: 'oid-123',
      role: SystemRoles.USER,
    });
  });

  it('syncs existing profile fields only when enabled', async () => {
    const existing = user({ username: 'old-user', name: 'Old User' });
    const deps = methods({
      findUser: mockFindUser(async () => existing),
      updateUser: mockUpdateUser(async (_userId, update) =>
        user({ ...existing, ...(update as Partial<IUser>) }),
      ),
    });

    await resolveOpenIdAccount(
      input({
        options: { ...baseOptions, syncProfileForExisting: true },
        methods: deps,
      }),
    );

    expect(deps.updateUser).toHaveBeenCalledWith(
      existing._id.toString(),
      expect.objectContaining({
        username: 'profile-user',
        name: 'Profile User',
        emailVerified: true,
      }),
    );
  });

  it('resolves existing tenant users from no-tenant provisioning mode without mutation', async () => {
    const existing = user({ tenantId: 'tenant-a' });
    const deps = methods({
      findUser: mockFindUser(async () => existing),
    });

    const result = await resolveOpenIdAccount(input({ methods: deps }));

    expect(result).toEqual({ status: 'resolved', user: existing, created: false });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('resolves no-tenant existing-users-only tenant users without mutation', async () => {
    const existing = user({ tenantId: 'tenant-a' });
    const deps = methods({
      findUser: mockFindUser(async () => existing),
    });

    const result = await resolveOpenIdAccount(
      input({
        options: {
          ...baseOptions,
          allowUserCreation: false,
          syncProfileForExisting: true,
        },
        methods: deps,
      }),
    );

    expect(result).toEqual({ status: 'resolved', user: existing, created: false });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('rejects users whose tenant does not match the request tenant before update', async () => {
    const existing = user({ tenantId: 'tenant-b' });
    const deps = methods({
      findUser: mockFindUser(async () => existing),
    });

    const result = await resolveOpenIdAccount(input({ tenantId: 'tenant-a', methods: deps }));

    expect(result).toEqual({ status: 'unauthorized', reason: 'duplicate_conflict' });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('scopes OpenID and email lookups to the request tenant', async () => {
    const tenantUser = user({ tenantId: 'tenant-a' });
    const otherTenantUser = user({ tenantId: 'tenant-b' });
    const deps = methods({
      findUser: mockFindUser(async (query) => {
        if (query.tenantId === 'tenant-a') {
          return tenantUser;
        }

        return otherTenantUser;
      }),
      updateUser: mockUpdateUser(async (_userId, update) =>
        user({ ...tenantUser, ...(update as Partial<IUser>) }),
      ),
    });

    const result = await resolveOpenIdAccount(input({ tenantId: 'tenant-a', methods: deps }));

    expect(result).toMatchObject({
      status: 'resolved',
      user: expect.objectContaining({ tenantId: 'tenant-a' }),
      created: false,
    });
    expect(deps.findUser).toHaveBeenCalledWith(
      expect.objectContaining({ openidId: 'sub-123', tenantId: 'tenant-a' }),
    );
    expect(deps.updateUser).toHaveBeenCalledWith(tenantUser._id.toString(), expect.any(Object));
  });

  it('accepts a duplicate create race only when retry lookup resolves a safe same-scope user', async () => {
    const existing = user();
    const deps = methods({
      findUser: mockFindUser()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing),
      createUser: mockCreateUser(async () => {
        throw duplicateKeyError();
      }),
      updateUser: mockUpdateUser(async () => existing),
    });

    const result = await resolveOpenIdAccount(input({ methods: deps }));

    expect(result).toMatchObject({ status: 'resolved', created: false });
    expect(deps.updateUser).toHaveBeenCalled();
  });

  it('accepts duplicate retry lookup that resolves a tenant user from base context without mutation', async () => {
    const existing = user({ tenantId: 'tenant-a' });
    const deps = methods({
      findUser: mockFindUser()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existing),
      createUser: mockCreateUser(async () => {
        throw duplicateKeyError();
      }),
    });

    const result = await resolveOpenIdAccount(input({ methods: deps }));

    expect(result).toEqual({ status: 'resolved', user: existing, created: false });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('rejects duplicate retry lookup that resolves a different request tenant', async () => {
    const deps = methods({
      findUser: mockFindUser()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(user({ tenantId: 'tenant-b' })),
      createUser: mockCreateUser(async () => {
        throw duplicateKeyError();
      }),
    });

    const result = await resolveOpenIdAccount(input({ tenantId: 'tenant-a', methods: deps }));

    expect(result).toEqual({ status: 'unauthorized', reason: 'duplicate_conflict' });
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it('rereads created users under the explicit tenant scope when create returns a partial user', async () => {
    const created = user({ tenantId: 'tenant-a' });
    let createAttempted = false;
    const deps = methods({
      findUser: mockFindUser(async (query) => {
        if (
          createAttempted &&
          query.openidId === 'sub-123' &&
          query.openidIssuer === 'https://issuer.example.com' &&
          query.tenantId === 'tenant-a'
        ) {
          return created;
        }

        return null;
      }),
      createUser: mockCreateUser(async () => {
        createAttempted = true;
        return { email: 'user@example.com' };
      }),
    });

    const result = await resolveOpenIdAccount(input({ tenantId: 'tenant-a', methods: deps }));

    expect(result).toMatchObject({
      status: 'resolved',
      user: expect.objectContaining({ id: created.id, tenantId: 'tenant-a' }),
      created: true,
    });
    expect(deps.findUser).toHaveBeenLastCalledWith({
      openidId: 'sub-123',
      openidIssuer: 'https://issuer.example.com',
      tenantId: 'tenant-a',
    });
  });

  it('rereads created users under the explicit base scope when no tenant is present', async () => {
    const created = user();
    const deps = methods({
      findUser: mockFindUser(async (query) => {
        if (
          query.openidId === 'sub-123' &&
          query.openidIssuer === 'https://issuer.example.com' &&
          typeof query.tenantId === 'object' &&
          query.tenantId != null &&
          '$exists' in query.tenantId &&
          query.tenantId.$exists === false
        ) {
          return created;
        }

        return null;
      }),
      createUser: mockCreateUser(async () => ({ email: 'user@example.com' })),
    });

    const result = await resolveOpenIdAccount(input({ methods: deps }));

    expect(result).toMatchObject({
      status: 'resolved',
      user: expect.objectContaining({ id: created.id }),
      created: true,
    });
    expect(deps.findUser).toHaveBeenLastCalledWith({
      openidId: 'sub-123',
      openidIssuer: 'https://issuer.example.com',
      tenantId: { $exists: false },
    });
  });
});
