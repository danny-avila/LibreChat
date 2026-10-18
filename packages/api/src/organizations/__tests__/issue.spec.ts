import mongoose from 'mongoose';
import { OrganizationErrorCode, OrganizationMemberStatus } from 'librechat-data-provider';
import {
  runAsSystem,
  runInTenant,
  runInAccounts,
  OrganizationStatus,
  ACCOUNTS_TENANT_ID,
} from '@librechat/data-schemas';
import type { IUser, ISession } from '@librechat/data-schemas';
import type { Response } from 'express';
import {
  verifyOrganizationOnboardingToken,
  generateOrganizationOnboardingToken,
} from '../onboarding';
import { createOrganizationsHarness, decodeJwtPayload } from './helpers/harness';
import { getAuthIdentity } from '../identity';
import { OrganizationError } from '../types';
import { createAuthIssuer } from '../issue';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();
const res = {} as Response;
const setLocalSessionCookies = jest.fn();
const setCloudFrontAuthCookies = jest.fn();
const materializePending = jest.fn();

function createIssuer(options: { withMaterializer?: boolean; withStatus?: boolean } = {}) {
  const { methods } = harness;
  return createAuthIssuer<IUser, ISession>({
    getUserById: methods.getUserById,
    createSession: methods.createSession,
    generateRefreshToken: methods.generateRefreshToken,
    generateToken: methods.generateToken,
    setLocalSessionCookies,
    setCloudFrontAuthCookies,
    listMembershipsForIdentity: methods.listMembershipsForIdentity,
    setLastActiveTenant: methods.setLastActiveTenant,
    generateOnboardingToken: (accountId) => `onboarding:${accountId}`,
    getExpiries: () => ({ refreshTokenMs: 60_000, sessionMs: 30_000 }),
    ...(options.withMaterializer ? { materializePending } : {}),
    ...(options.withStatus
      ? {
          getOrganizationStatus: async (tenantId: string) =>
            (await methods.findOrganization(tenantId))?.status ?? null,
        }
      : {}),
  });
}

async function sessionsOf(tenantId: string) {
  return runInTenant(tenantId, async () => mongoose.models.Session.find({}).lean<ISession[]>());
}

beforeAll(() => harness.start());
afterAll(() => harness.stop());
beforeEach(async () => {
  jest.clearAllMocks();
  await harness.reset();
});

describe('issuing for a login account', () => {
  it('issues for the member of the last active organization, never for the account', async () => {
    const alice = await harness.createAccount('alice@example.com', { twoFactorEnabled: false });
    const acme = await harness.createOrganizationWithMember(alice, 'ADMIN');
    const beta = await harness.createOrganizationWithMember(alice, 'USER');
    await harness.methods.setLastActiveTenant(alice._id, beta.tenantId);

    const issued = await createIssuer()(alice._id, res);

    expect(issued.user?._id.toString()).toBe(beta.member._id.toString());
    expect(issued.user?.tenantId).toBe(beta.tenantId);
    const payload = decodeJwtPayload(issued.token!);
    expect(payload).toMatchObject({ id: beta.member._id.toString(), aid: alice._id.toString() });

    const [session] = await sessionsOf(beta.tenantId);
    expect(session).toMatchObject({ tenantId: beta.tenantId });
    expect(session.user.toString()).toBe(beta.member._id.toString());
    expect(session.identity?.toString()).toBe(alice._id.toString());
    await expect(sessionsOf(acme.tenantId)).resolves.toEqual([]);
    await expect(sessionsOf(ACCOUNTS_TENANT_ID)).resolves.toEqual([]);
    expect(setLocalSessionCookies).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ userId: beta.member._id, tenantId: beta.tenantId }),
    );
  });

  it('answers with the member carrying its account credential state and identity', async () => {
    const alice = await harness.createAccount('alice@example.com', { twoFactorEnabled: true });
    await harness.createOrganizationWithMember(alice);

    const issued = await createIssuer()(alice._id, res);

    expect(issued.user).toMatchObject({ provider: 'local', twoFactorEnabled: true });
    expect(getAuthIdentity(issued.user!)?._id.toString()).toBe(alice._id.toString());
    expect(JSON.parse(JSON.stringify(issued.user))).not.toHaveProperty('authIdentity');
  });

  it('opens the oldest membership by default and remembers it', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const first = await harness.createOrganizationWithMember(alice);
    await harness.createOrganizationWithMember(alice);

    const issued = await createIssuer()(alice._id, res);

    expect(issued.user?.tenantId).toBe(first.tenantId);
    const stored = await runInAccounts(() => harness.methods.getUserById(alice._id.toString()));
    expect(stored?.lastActiveTenantId).toBe(first.tenantId);
  });

  it('opens a requested organization, and refuses one the account is not a member of', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const bob = await harness.createAccount('bob@example.com');
    await harness.createOrganizationWithMember(alice);
    const beta = await harness.createOrganizationWithMember(alice);
    const bobs = await harness.createOrganizationWithMember(bob);
    const issue = createIssuer();

    const issued = await issue(alice._id, res, null, null, { tenantId: beta.tenantId });
    expect(issued.user?.tenantId).toBe(beta.tenantId);

    await expect(
      issue(alice._id, res, null, null, { tenantId: bobs.tenantId }),
    ).rejects.toMatchObject({ code: OrganizationErrorCode.NOT_A_MEMBER });
  });

  it('skips a suspended organization, and says so when it was the only one', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice, 'ADMIN');
    const beta = await harness.createOrganizationWithMember(alice, 'ADMIN');
    await harness.methods.setLastActiveTenant(alice._id, acme.tenantId);
    await harness.methods.setOrganizationStatus(acme.tenantId, OrganizationStatus.SUSPENDED);
    const issue = createIssuer({ withStatus: true });

    const issued = await issue(alice._id, res);
    expect(issued.user?.tenantId).toBe(beta.tenantId);
    await expect(issue(alice._id, res, null, null, { tenantId: acme.tenantId })).rejects.toEqual(
      new OrganizationError(OrganizationErrorCode.ORGANIZATION_SUSPENDED, 403),
    );

    await harness.methods.setOrganizationStatus(beta.tenantId, OrganizationStatus.SUSPENDED);
    await expect(issue(alice._id, res)).rejects.toMatchObject({
      code: OrganizationErrorCode.ORGANIZATION_SUSPENDED,
    });
    /* Refreshing a member of a suspended organization is refused too. */
    await expect(issue(beta.member._id, res)).rejects.toMatchObject({
      code: OrganizationErrorCode.ORGANIZATION_SUSPENDED,
    });
  });

  it('prefers the operator organization over one it only visits, and lets it into suspended ones', async () => {
    const operator = await harness.createAccount('operator@example.com');
    const owner = await harness.createAccount('owner@example.com');
    const customer = await harness.createOrganizationWithMember(owner, 'ADMIN');
    const visit = await harness.methods.ensureOperatorMembership({
      tenantId: customer.tenantId,
      account: operator,
    });
    const own = await harness.createOrganizationWithMember(operator, 'ADMIN');
    await harness.methods.setOrganizationStatus(customer.tenantId, OrganizationStatus.SUSPENDED);
    const issue = createIssuer({ withStatus: true });

    const byDefault = await issue(operator._id, res);
    expect(byDefault.user?.tenantId).toBe(own.tenantId);

    const visiting = await issue(operator._id, res, null, null, { tenantId: customer.tenantId });
    expect(visiting.user?._id.toString()).toBe(visit._id.toString());
  });

  it('skips deactivated memberships and requires onboarding when none is left', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    await runInTenant(acme.tenantId, () =>
      harness.methods.updateOrganizationMember(acme.member._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      }),
    );

    const issued = await createIssuer()(alice._id, res);

    expect(issued).toEqual({ onboardingToken: `onboarding:${alice._id.toString()}` });
    expect(setLocalSessionCookies).not.toHaveBeenCalled();
    await expect(sessionsOf(acme.tenantId)).resolves.toEqual([]);
  });

  it('creates pending access for a verified account before choosing, and survives its failure', async () => {
    const alice = await harness.createAccount('alice@example.com');
    let created: { tenantId: string } | undefined;
    materializePending.mockImplementationOnce(async (account: IUser) => {
      created = await harness.createOrganizationWithMember(account);
    });
    const issue = createIssuer({ withMaterializer: true });

    const issued = await issue(alice._id, res);
    expect(materializePending).toHaveBeenCalledTimes(1);
    expect(issued.user?.tenantId).toBe(created?.tenantId);

    const bob = await harness.createAccount('bob@example.com');
    materializePending.mockRejectedValueOnce(new Error('boom'));
    await expect(issue(bob._id, res)).resolves.toEqual({
      onboardingToken: `onboarding:${bob._id.toString()}`,
    });
  });

  it('does not create pending access for an unverified account', async () => {
    const carol = await harness.createAccount('carol@example.com', { emailVerified: false });

    await createIssuer({ withMaterializer: true })(carol._id, res);

    expect(materializePending).not.toHaveBeenCalled();
  });
});

describe('issuing for a member (refresh)', () => {
  it('rotates the existing session inside the member tenant', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    const issue = createIssuer();
    await issue(alice._id, res);
    const [stored] = await sessionsOf(acme.tenantId);
    const session = await runAsSystem(async () =>
      mongoose.models.Session.findById<ISession>(stored._id),
    );
    if (!session) {
      throw new Error('The member session was not stored');
    }
    const previousHash = session.refreshTokenHash;

    /* Credential routes run in the accounts tenant; the issuer must not save there. */
    const issued = await runInAccounts(() => issue(acme.member._id, res, session));

    expect(decodeJwtPayload(issued.token!)).toMatchObject({ id: acme.member._id.toString() });
    const [rotated] = await sessionsOf(acme.tenantId);
    expect(rotated._id.toString()).toBe(stored._id.toString());
    expect(rotated.refreshTokenHash).not.toBe(previousHash);
  });

  it('refuses a deactivated member', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const acme = await harness.createOrganizationWithMember(alice);
    await runInTenant(acme.tenantId, () =>
      harness.methods.updateOrganizationMember(acme.member._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      }),
    );

    const failure = createIssuer()(acme.member._id, res);

    await expect(failure).rejects.toBeInstanceOf(OrganizationError);
    await expect(failure).rejects.toMatchObject({
      code: OrganizationErrorCode.MEMBERSHIP_INACTIVE,
    });
  });
});

describe('issuing for a single-tenant user', () => {
  it('issues as before organizations and names no subject', async () => {
    const legacy = (await runAsSystem(
      async () =>
        (await harness.methods.createUser(
          { email: 'legacy@example.com', provider: 'local' },
          undefined,
          true,
          true,
        )) as IUser,
    )) as IUser;

    const issued = await runAsSystem(() => createIssuer()(legacy._id, res));

    expect(Object.keys(issued)).toEqual(['token']);
    expect(decodeJwtPayload(issued.token!)).not.toHaveProperty('aid');
  });
});

describe('onboarding tokens', () => {
  it('name the account and are refused once tampered with', () => {
    const token = generateOrganizationOnboardingToken('account-1', 'secret');

    expect(verifyOrganizationOnboardingToken(token, 'secret')).toMatchObject({
      accountId: 'account-1',
    });
    expect(verifyOrganizationOnboardingToken(token, 'other-secret')).toBeUndefined();
    expect(verifyOrganizationOnboardingToken(undefined, 'secret')).toBeUndefined();
  });
});
