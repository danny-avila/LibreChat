import type { AppConfig, IUser } from '@librechat/data-schemas';
import type { VerifiedClerkIdentity } from './verify';
import { recordClerkIdentityResolution } from '../../app/metrics';
import { resolveClerkIdentity } from './service';

jest.mock('../../app/metrics', () => ({
  recordClerkIdentityResolution: jest.fn(),
}));

const recordClerkIdentityResolutionMock = jest.mocked(recordClerkIdentityResolution);

const identity: VerifiedClerkIdentity = {
  clerkId: 'user_clerk',
  clerkSessionId: 'sess_clerk',
  clerkTokenId: 'token_clerk',
  authorizedParty: 'https://chat.example.com',
  tokenIssuedAt: new Date('2026-08-13T12:00:00.000Z'),
  tokenExpiresAt: new Date('2026-08-13T12:10:00.000Z'),
  email: 'user@example.com',
  emailVerified: true,
  name: 'Clerk User',
  username: 'clerk-user',
  avatarUrl: 'https://images.example.com/avatar.png',
};

const appConfig = {} as AppConfig;

function user(overrides: Record<string, unknown> = {}): IUser {
  return {
    _id: 'local-user-id',
    id: 'local-user-id',
    email: 'user@example.com',
    emailVerified: true,
    provider: 'local',
    ...overrides,
  } as unknown as IUser;
}

function createDependencies() {
  return {
    findUser: jest.fn(),
    linkClerkIdentity: jest.fn(),
    createSocialUser: jest.fn(),
  };
}

describe('resolveClerkIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authenticates an exact-subject candidate without loading a profile-dependent email user', async () => {
    const deps = createDependencies();
    const userByClerkId = user({ clerkId: identity.clerkId });

    await expect(
      resolveClerkIdentity(
        { identity, tenantId: 'tenant-a', userByClerkId, userByEmail: undefined, appConfig },
        deps,
      ),
    ).resolves.toEqual({ status: 'authenticated', user: userByClerkId });
    expect(deps.linkClerkIdentity).not.toHaveBeenCalled();
    expect(deps.createSocialUser).not.toHaveBeenCalled();
    expect(recordClerkIdentityResolutionMock).toHaveBeenCalledWith('authenticated', 'none');
  });

  it('forbids an exact-subject candidate whose Clerk binding is tombstoned', async () => {
    const deps = createDependencies();
    const userByClerkId = user({
      clerkId: identity.clerkId,
      clerkDeletedAt: new Date('2026-08-13T11:00:00.000Z'),
    });

    await expect(
      resolveClerkIdentity({ identity, userByClerkId, userByEmail: undefined, appConfig }, deps),
    ).resolves.toEqual({ status: 'forbidden' });
  });

  it('authenticates an email candidate already linked to the same subject after a lookup race', async () => {
    const deps = createDependencies();
    const userByEmail = user({ clerkId: identity.clerkId });

    await expect(
      resolveClerkIdentity({ identity, userByClerkId: null, userByEmail, appConfig }, deps),
    ).resolves.toEqual({ status: 'already_linked', user: userByEmail });
  });

  it('conflicts on the same email bound to another subject even when its provider is Clerk', async () => {
    const deps = createDependencies();

    await expect(
      resolveClerkIdentity(
        {
          identity,
          userByClerkId: null,
          userByEmail: user({ provider: 'clerk', clerkId: 'different_subject' }),
          appConfig,
        },
        deps,
      ),
    ).resolves.toEqual({ status: 'conflict' });
  });

  it('conflicts on a tombstoned email binding without attempting to relink it', async () => {
    const deps = createDependencies();

    await expect(
      resolveClerkIdentity(
        {
          identity,
          userByClerkId: null,
          userByEmail: user({ clerkDeletedAt: new Date() }),
          appConfig,
        },
        deps,
      ),
    ).resolves.toEqual({ status: 'conflict' });
    expect(deps.linkClerkIdentity).not.toHaveBeenCalled();
  });

  it('atomically links a verified email candidate and preserves its existing provider', async () => {
    const deps = createDependencies();
    const userByEmail = user({ provider: 'openid', twoFactorEnabled: true });
    const linkedUser = user({
      provider: 'openid',
      twoFactorEnabled: true,
      clerkId: identity.clerkId,
    });
    deps.linkClerkIdentity.mockResolvedValue({ status: 'linked', user: linkedUser });

    await expect(
      resolveClerkIdentity(
        { identity, tenantId: 'tenant-a', userByClerkId: null, userByEmail, appConfig },
        deps,
      ),
    ).resolves.toEqual({ status: 'linked', user: linkedUser });
    expect(deps.linkClerkIdentity).toHaveBeenCalledWith({
      userId: 'local-user-id',
      clerkId: identity.clerkId,
      tenantId: 'tenant-a',
    });
    expect(linkedUser.provider).toBe('openid');
    expect(linkedUser.twoFactorEnabled).toBe(true);
  });

  it('does not link an email candidate without explicit authoritative verification', async () => {
    const deps = createDependencies();
    const unverifiedIdentity = { ...identity, emailVerified: undefined };

    await expect(
      resolveClerkIdentity(
        {
          identity: unverifiedIdentity,
          userByClerkId: null,
          userByEmail: user(),
          appConfig,
        },
        deps,
      ),
    ).resolves.toEqual({ status: 'forbidden' });
    expect(deps.linkClerkIdentity).not.toHaveBeenCalled();
  });

  it.each(['already_linked', 'conflict', 'not_found'] as const)(
    'passes through the atomic linker %s result exhaustively',
    async (status) => {
      const deps = createDependencies();
      const existingUser = user({ clerkId: identity.clerkId });
      deps.linkClerkIdentity.mockResolvedValue(
        status === 'already_linked' ? { status, user: existingUser } : { status },
      );

      const result = await resolveClerkIdentity(
        { identity, userByClerkId: null, userByEmail: user(), appConfig },
        deps,
      );

      expect(result).toEqual(
        status === 'already_linked' ? { status, user: existingUser } : { status },
      );
    },
  );

  it('creates a Clerk-origin user only from an explicitly verified authoritative email', async () => {
    const deps = createDependencies();
    const createdUser = user({ provider: 'clerk', clerkId: identity.clerkId });
    deps.createSocialUser.mockResolvedValue(createdUser);

    await expect(
      resolveClerkIdentity(
        { identity, tenantId: 'tenant-a', userByClerkId: null, userByEmail: null, appConfig },
        deps,
      ),
    ).resolves.toEqual({ status: 'created', user: createdUser });
    expect(deps.createSocialUser).toHaveBeenCalledWith({
      email: identity.email,
      emailVerified: true,
      avatarUrl: identity.avatarUrl,
      provider: 'clerk',
      providerKey: 'clerkId',
      providerId: identity.clerkId,
      username: identity.username,
      name: identity.name,
      appConfig,
    });
  });

  it.each([
    ['missing verification', { ...identity, emailVerified: undefined }],
    ['missing email', { ...identity, email: undefined }],
  ])('forbids creation with %s', async (_case, unverifiedIdentity) => {
    const deps = createDependencies();

    await expect(
      resolveClerkIdentity(
        {
          identity: unverifiedIdentity,
          userByClerkId: null,
          userByEmail: null,
          appConfig,
        },
        deps,
      ),
    ).resolves.toEqual({ status: 'forbidden' });
    expect(deps.createSocialUser).not.toHaveBeenCalled();
  });

  it('converges a duplicate create by re-reading the exact tenant-scoped subject', async () => {
    const deps = createDependencies();
    const winner = user({ clerkId: identity.clerkId });
    deps.createSocialUser.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
    deps.findUser.mockResolvedValueOnce(winner);

    await expect(
      resolveClerkIdentity(
        { identity, tenantId: 'tenant-a', userByClerkId: null, userByEmail: null, appConfig },
        deps,
      ),
    ).resolves.toEqual({ status: 'already_linked', user: winner });
    expect(deps.findUser).toHaveBeenCalledWith(
      { clerkId: identity.clerkId, tenantId: 'tenant-a' },
      '+clerkDeletedAt',
    );
    expect(deps.createSocialUser).toHaveBeenCalledTimes(1);
    expect(recordClerkIdentityResolutionMock).toHaveBeenCalledWith(
      'already_linked',
      'create_duplicate',
    );
  });

  it('uses an explicit tenantless scope when converging a duplicate create by email', async () => {
    const deps = createDependencies();
    const winner = user({ clerkId: identity.clerkId });
    deps.createSocialUser.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
    deps.findUser.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);

    await expect(
      resolveClerkIdentity({ identity, userByClerkId: null, userByEmail: null, appConfig }, deps),
    ).resolves.toEqual({ status: 'already_linked', user: winner });
    expect(deps.findUser).toHaveBeenNthCalledWith(
      2,
      { email: identity.email, tenantId: { $exists: false } },
      '+clerkDeletedAt',
    );
  });

  it('does not hide non-duplicate creation failures', async () => {
    const deps = createDependencies();
    const failure = new Error('storage unavailable');
    deps.createSocialUser.mockRejectedValue(failure);

    await expect(
      resolveClerkIdentity({ identity, userByClerkId: null, userByEmail: null, appConfig }, deps),
    ).rejects.toBe(failure);
    expect(deps.findUser).not.toHaveBeenCalled();
  });
});
