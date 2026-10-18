import mongoose from 'mongoose';
import { OrganizationMemberStatus } from 'librechat-data-provider';
import {
  runAsSystem,
  runInTenant,
  runInAccounts,
  OrganizationStatus,
} from '@librechat/data-schemas';
import type { IUser, ISession } from '@librechat/data-schemas';
import {
  getAuthIdentity,
  createAuthUserLoader,
  getViolationSubjectId,
  createAuthSessionHelpers,
  createPrincipalSessionRevoker,
} from '../identity';
import { createOrganizationsHarness } from './helpers/harness';
import { createOrganizationStatusCache } from '../status';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();
const loader = () => createAuthUserLoader<IUser>({ getUserById: harness.methods.getUserById });

beforeAll(() => harness.start());
afterAll(() => harness.stop());
beforeEach(() => harness.reset());

describe('createAuthUserLoader', () => {
  it('overlays the account credential state onto a member and carries the account', async () => {
    const credentialsChangedAt = new Date('2026-01-01T00:00:00Z');
    const alice = await harness.createAccount('alice@example.com', {
      twoFactorEnabled: true,
      credentialsChangedAt,
    });
    const { member } = await harness.createOrganizationWithMember(alice);

    const loaded = await loader()(member._id.toString(), '-password');

    expect(loaded).toMatchObject({
      tenantId: member.tenantId,
      role: member.role,
      provider: 'local',
      twoFactorEnabled: true,
      credentialsChangedAt,
    });
    expect(getAuthIdentity(loaded)?._id.toString()).toBe(alice._id.toString());
    expect(Object.keys(loaded ?? {})).not.toContain('authIdentity');
  });

  it('marks a member of the platform operator so the app can show admin entry points', async () => {
    const operator = await harness.createAccount('operator@example.com');
    await harness.methods.claimPlatformOperator(operator._id);
    const customer = await harness.createAccount('customer@example.com');
    const [{ member: operatorMember }, { member: customerMember }] = await Promise.all([
      harness.createOrganizationWithMember(operator),
      harness.createOrganizationWithMember(customer),
    ]);

    const [asOperator, asCustomer] = await Promise.all([
      loader()(operatorMember._id.toString(), '-password'),
      loader()(customerMember._id.toString(), '-password'),
    ]);

    expect(asOperator?.isPlatformOperator).toBe(true);
    expect(getAuthIdentity(asOperator)?.isPlatformOperator).toBe(true);
    expect(asCustomer).not.toHaveProperty('isPlatformOperator');
    expect(getAuthIdentity(asCustomer)?.isPlatformOperator).toBe(false);
  });

  it('refuses a member of a suspended organization, but never the operator visiting it', async () => {
    const owner = await harness.createAccount('owner@example.com');
    const operator = await harness.createAccount('operator@example.com');
    const { tenantId, member } = await harness.createOrganizationWithMember(owner);
    const access = await harness.methods.ensureOperatorMembership({ tenantId, account: operator });
    const statuses = createOrganizationStatusCache({
      findOrganization: harness.methods.findOrganization,
    });
    const load = createAuthUserLoader<IUser>({
      getUserById: harness.methods.getUserById,
      getOrganizationStatus: statuses.getStatus,
    });

    await expect(load(member._id.toString(), '-password')).resolves.not.toBeNull();

    await harness.methods.setOrganizationStatus(tenantId, OrganizationStatus.SUSPENDED);
    statuses.evict(tenantId);

    /* Through the token claims (one parallel round) or without them. */
    await expect(
      load(member._id.toString(), '-password', owner._id.toString(), tenantId),
    ).resolves.toBeNull();
    await expect(load(member._id.toString(), '-password')).resolves.toBeNull();
    await expect(load(access._id.toString(), '-password')).resolves.not.toBeNull();
  });

  it('adds the membership fields to an inclusion projection', async () => {
    const alice = await harness.createAccount('alice@example.com', {
      credentialsChangedAt: new Date('2026-02-01T00:00:00Z'),
    });
    const { member } = await harness.createOrganizationWithMember(alice);

    const loaded = await loader()(
      member._id.toString(),
      'twoFactorEnrolledAt credentialsChangedAt',
    );

    expect(loaded?.credentialsChangedAt).toEqual(new Date('2026-02-01T00:00:00Z'));
    expect(loaded?.identityId?.toString()).toBe(alice._id.toString());
  });

  it('loads member and account together when the token names the account', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const bob = await harness.createAccount('bob@example.com');
    const { member } = await harness.createOrganizationWithMember(alice);
    const getUserById = jest.fn(harness.methods.getUserById);
    const load = createAuthUserLoader<IUser>({ getUserById });

    await expect(load(member._id.toString(), null, alice._id.toString())).resolves.not.toBeNull();
    expect(getUserById).toHaveBeenCalledTimes(2);
    await expect(load(member._id.toString(), null, bob._id.toString())).resolves.toBeNull();
  });

  it('refuses login accounts, deactivated members and orphaned members', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const { member, tenantId } = await harness.createOrganizationWithMember(alice);

    await expect(loader()(alice._id.toString())).resolves.toBeNull();

    await runInTenant(tenantId, () =>
      harness.methods.updateOrganizationMember(member._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      }),
    );
    await expect(loader()(member._id.toString())).resolves.toBeNull();

    const bob = await harness.createAccount('bob@example.com');
    const bobs = await harness.createOrganizationWithMember(bob);
    await runInAccounts(() => harness.methods.deleteUserById(bob._id.toString()));
    await expect(loader()(bobs.member._id.toString())).resolves.toBeNull();
  });

  it('returns a single-tenant user unchanged', async () => {
    const legacy = (await runAsSystem(
      async () =>
        (await harness.methods.createUser(
          { email: 'legacy@example.com', provider: 'local', twoFactorEnabled: false },
          undefined,
          true,
          true,
        )) as IUser,
    )) as IUser;

    const loaded = await loader()(legacy._id.toString());

    expect(loaded?._id.toString()).toBe(legacy._id.toString());
    expect(getAuthIdentity(loaded)).toBeUndefined();
  });
});

describe('createPrincipalSessionRevoker', () => {
  it('revokes every session of the account behind a member, in every organization', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    const beta = await harness.createOrganizationWithMember(alice);
    for (const { tenantId, member } of [acme, beta]) {
      await runInTenant(tenantId, () =>
        harness.methods.createSession(member._id.toString(), {
          identityId: alice._id.toString(),
        }),
      );
    }
    const revoke = createPrincipalSessionRevoker({
      getUserById: harness.methods.getUserById,
      deleteAllUserSessions: harness.methods.deleteAllUserSessions,
      deleteAllAccountSessions: harness.methods.deleteAllAccountSessions,
    });

    await revoke({ userId: acme.member._id.toString() });

    const remaining = await runAsSystem(async () => mongoose.models.Session.countDocuments({}));
    expect(remaining).toBe(0);
  });

  it('revokes all of an account sessions when given the account itself', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    await runInTenant(acme.tenantId, () =>
      harness.methods.createSession(acme.member._id.toString(), {
        identityId: alice._id.toString(),
      }),
    );
    const deleteAllAccountSessions = jest.fn(harness.methods.deleteAllAccountSessions);
    const deleteAllUserSessions = jest.fn(harness.methods.deleteAllUserSessions);
    const revoke = createPrincipalSessionRevoker({
      getUserById: harness.methods.getUserById,
      deleteAllUserSessions,
      deleteAllAccountSessions,
    });

    await revoke({ userId: alice._id.toString() });

    expect(deleteAllAccountSessions).toHaveBeenCalledWith(alice._id.toString());
    expect(deleteAllUserSessions).not.toHaveBeenCalled();
  });
});

describe('createAuthSessionHelpers', () => {
  function build(enabled: boolean) {
    const deps = {
      getUserById: jest.fn(async () => null),
      findSession: jest.fn(async () => 'session' as unknown as ISession),
      deleteSession: jest.fn(async () => ({})),
      deleteAllUserSessions: jest.fn(async () => ({})),
      deleteAllAccountSessions: jest.fn(async () => ({})),
      isOrganizationsEnabled: () => enabled,
    };
    return { deps, helpers: createAuthSessionHelpers(deps) };
  }

  it('is exactly the plain database methods when organizations are disabled', async () => {
    const { deps, helpers } = build(false);

    await helpers.getAuthUserById('user-1', '-password');
    await helpers.deleteAllPrincipalSessions({ userId: 'user-1' });
    await helpers.findAuthSession({ userId: 'user-1' }, { lean: false });
    await helpers.deleteAuthSession({ sessionId: 'session-1' });

    expect(deps.getUserById).toHaveBeenCalledWith('user-1', '-password');
    expect(deps.deleteAllUserSessions).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(deps.findSession).toHaveBeenCalledWith({ userId: 'user-1' }, { lean: false });
    expect(deps.deleteSession).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(deps.deleteAllAccountSessions).not.toHaveBeenCalled();
  });

  it('finds a member session from the accounts tenant when organizations are enabled', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    const { refreshToken } = await runInTenant(acme.tenantId, () =>
      harness.methods.createSession(acme.member._id.toString(), {
        identityId: alice._id.toString(),
      }),
    );
    const helpers = createAuthSessionHelpers({
      ...harness.methods,
      isOrganizationsEnabled: () => true,
    });

    const found = await runInAccounts(() =>
      helpers.findAuthSession({ userId: acme.member._id.toString(), refreshToken }, { lean: true }),
    );

    expect(found?.tenantId).toBe(acme.tenantId);
  });
});

describe('getViolationSubjectId', () => {
  it('keys a member on its account and anyone else on their own id', () => {
    const identityId = new mongoose.Types.ObjectId();
    expect(getViolationSubjectId({ id: 'member-1', identityId })).toBe(identityId.toString());
    expect(getViolationSubjectId({ id: 'user-1' })).toBe('user-1');
    expect(
      getViolationSubjectId({ _id: new mongoose.Types.ObjectId('0123456789abcdef01234567') }),
    ).toBe('0123456789abcdef01234567');
    expect(getViolationSubjectId(null)).toBeUndefined();
  });
});
