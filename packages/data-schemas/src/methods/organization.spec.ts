import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  SystemRoles,
  OrganizationInviteKind,
  OrganizationInviteStatus,
  OrganizationMemberStatus,
  ORGANIZATION_MEMBER_PROVIDER,
} from 'librechat-data-provider';
import type * as t from '~/types';
import { createOrganizationMethods, generateOrganizationTenantId } from './organization';
import { runInAccounts, runInTenant, tenantStorage } from '~/config/tenantContext';
import { createOrganizationInviteMethods } from './organizationInvite';
import { _resetStrictCache } from '~/models/plugins/tenantIsolation';
import { createSessionMethods } from './session';
import { createUserMethods } from './user';
import { createModels } from '~/models';

let mongoServer: MongoMemoryServer;
let users: ReturnType<typeof createUserMethods>;
let orgs: ReturnType<typeof createOrganizationMethods>;
let invites: ReturnType<typeof createOrganizationInviteMethods>;
let sessions: ReturnType<typeof createSessionMethods>;

const ORIGINAL_ENV = {
  TENANT_ISOLATION_STRICT: process.env.TENANT_ISOLATION_STRICT,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  users = createUserMethods(mongoose);
  orgs = createOrganizationMethods(mongoose, {
    createUser: users.createUser,
    invalidateAuthUserDocCache: users.invalidateAuthUserDocCache,
  });
  invites = createOrganizationInviteMethods(mongoose);
  sessions = createSessionMethods(mongoose);
  process.env.JWT_REFRESH_SECRET = 'organization-spec-refresh-secret';
});

afterAll(async () => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  _resetStrictCache();
  await mongoose.disconnect();
  await mongoServer.stop();
});

const TOUCHED_MODELS = ['User', 'Balance', 'Session', 'Organization', 'OrganizationInvite'];

beforeEach(async () => {
  delete process.env.TENANT_ISOLATION_STRICT;
  _resetStrictCache();
  await Promise.all(TOUCHED_MODELS.map((name) => mongoose.models[name].deleteMany({})));
  /* Every method under test must bring its own tenant context: unscoped queries fail. */
  process.env.TENANT_ISOLATION_STRICT = 'true';
  _resetStrictCache();
});

async function createAccount(email: string): Promise<t.IUser> {
  return runInAccounts(
    async () =>
      (await users.createUser(
        { email, name: email.split('@')[0], username: email.split('@')[0], provider: 'local' },
        undefined,
        true,
        true,
      )) as t.IUser,
  );
}

async function createOrg(name: string, createdBy: t.IUser) {
  return orgs.createOrganization({
    tenantId: generateOrganizationTenantId(),
    name,
    createdBy: createdBy._id,
  });
}

describe('generateOrganizationTenantId', () => {
  it('produces distinct ids inside the tenant header alphabet', () => {
    const ids = new Set(Array.from({ length: 50 }, generateOrganizationTenantId));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(/^org_[a-f0-9]{24}$/);
    }
  });
});

describe('organizations', () => {
  it('stores an organization in its own tenant and finds it by tenant id', async () => {
    const alice = await createAccount('alice@example.com');
    const acme = await createOrg('Acme', alice);

    expect(acme).toMatchObject({ name: 'Acme', status: 'active', tenantId: acme.tenantId });
    await expect(orgs.findOrganization(acme.tenantId)).resolves.toMatchObject({ name: 'Acme' });

    const other = generateOrganizationTenantId();
    const seenFromOther = await runInTenant(other, async () =>
      mongoose.models.Organization.find({}).lean(),
    );
    expect(seenFromOther).toEqual([]);
  });

  it('renames an organization and resolves several by tenant id at once', async () => {
    const alice = await createAccount('alice@example.com');
    const [acme, beta] = await Promise.all([createOrg('Acme', alice), createOrg('Beta', alice)]);

    await orgs.renameOrganization(acme.tenantId, 'Acme Inc');
    const found = await orgs.findOrganizationsByTenantIds([acme.tenantId, beta.tenantId]);

    expect(found.map((org) => org.name).sort()).toEqual(['Acme Inc', 'Beta']);
    await expect(orgs.findOrganizationsByTenantIds([])).resolves.toEqual([]);
  });
});

describe('memberships', () => {
  it('creates a credential-free member record that points at the account', async () => {
    const alice = await createAccount('alice@example.com');
    const acme = await createOrg('Acme', alice);

    const { member, outcome } = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: alice,
      role: SystemRoles.ADMIN,
    });

    expect(outcome).toBe('created');
    expect(member._id.toString()).not.toBe(alice._id.toString());
    expect(member).toMatchObject({
      email: 'alice@example.com',
      provider: ORGANIZATION_MEMBER_PROVIDER,
      role: SystemRoles.ADMIN,
      status: OrganizationMemberStatus.ACTIVE,
      emailVerified: true,
      tenantId: acme.tenantId,
    });
    expect(member.identityId?.toString()).toBe(alice._id.toString());
    const stored = await runInTenant(acme.tenantId, async () =>
      mongoose.models.User.findById(member._id, '+password').lean<t.IUser>(),
    );
    expect(stored?.password).toBeUndefined();
  });

  it('returns the existing membership and converges concurrent creations on one record', async () => {
    const alice = await createAccount('alice@example.com');
    const acme = await createOrg('Acme', alice);
    const params = { tenantId: acme.tenantId, account: alice, role: SystemRoles.USER };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => orgs.createMembership(params)),
    );

    const ids = new Set(results.map(({ member }) => member._id.toString()));
    expect(ids.size).toBe(1);
    expect(results.filter(({ outcome }) => outcome === 'created')).toHaveLength(1);
    const again = await orgs.createMembership(params);
    expect(again.outcome).toBe('existing');
  });

  it('reactivates a deactivated member, keeping its record, with the new role', async () => {
    const alice = await createAccount('alice@example.com');
    const acme = await createOrg('Acme', alice);
    const { member } = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: alice,
      role: SystemRoles.ADMIN,
    });
    await runInTenant(acme.tenantId, () =>
      orgs.updateOrganizationMember(member._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      }),
    );

    const again = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: alice,
      role: SystemRoles.USER,
    });

    expect(again.outcome).toBe('reactivated');
    expect(again.member._id.toString()).toBe(member._id.toString());
    expect(again.member).toMatchObject({
      status: OrganizationMemberStatus.ACTIVE,
      role: SystemRoles.USER,
    });
  });

  it('lists an account memberships across organizations and finds one by tenant', async () => {
    const alice = await createAccount('alice@example.com');
    const bob = await createAccount('bob@example.com');
    const [acme, beta] = await Promise.all([createOrg('Acme', alice), createOrg('Beta', alice)]);
    await orgs.createMembership({ tenantId: acme.tenantId, account: alice, role: 'ADMIN' });
    await orgs.createMembership({ tenantId: beta.tenantId, account: alice, role: 'USER' });
    await orgs.createMembership({ tenantId: beta.tenantId, account: bob, role: 'ADMIN' });

    const memberships = await orgs.listMembershipsForIdentity(alice._id);

    expect(memberships.map((m) => [m.tenantId, m.role]).sort()).toEqual(
      [
        [acme.tenantId, 'ADMIN'],
        [beta.tenantId, 'USER'],
      ].sort(),
    );
    await expect(orgs.findMembership(bob._id, acme.tenantId)).resolves.toBeNull();
    await expect(orgs.findMembership(bob._id, beta.tenantId)).resolves.toMatchObject({
      role: 'ADMIN',
    });
  });

  it('lists, searches and counts only the current organization members', async () => {
    const alice = await createAccount('alice@example.com');
    const bob = await createAccount('bob@example.com');
    const carol = await createAccount('carol@example.com');
    const [acme, beta] = await Promise.all([createOrg('Acme', alice), createOrg('Beta', bob)]);
    const { member: aliceInAcme } = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: alice,
      role: SystemRoles.ADMIN,
    });
    const { member: carolInAcme } = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: carol,
      role: SystemRoles.ADMIN,
    });
    await orgs.createMembership({ tenantId: beta.tenantId, account: bob, role: SystemRoles.ADMIN });

    await runInTenant(acme.tenantId, async () => {
      const members = await orgs.listOrganizationMembers({ limit: 10 });
      expect(members.map((m) => m.email).sort()).toEqual([
        'alice@example.com',
        'carol@example.com',
      ]);
      expect(members[0]).not.toHaveProperty('password');

      const searched = await orgs.listOrganizationMembers({ limit: 10, search: 'carol' });
      expect(searched.map((m) => m.email)).toEqual(['carol@example.com']);

      const page = await orgs.listOrganizationMembers({
        limit: 10,
        after: aliceInAcme._id.toString(),
      });
      expect(page.map((m) => m.email)).toEqual(['carol@example.com']);

      expect(await orgs.countActiveOrganizationAdmins()).toBe(2);
      expect(await orgs.countActiveOrganizationAdmins(carolInAcme._id.toString())).toBe(1);
      await orgs.updateOrganizationMember(carolInAcme._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      });
      expect(await orgs.countActiveOrganizationAdmins()).toBe(1);

      /* A member of another organization is not reachable by id from here. */
      const bobInBeta = await orgs.findMembership(bob._id, beta.tenantId);
      await expect(orgs.findOrganizationMember(bobInBeta!._id.toString())).resolves.toBeNull();
      await expect(
        orgs.updateOrganizationMember(bobInBeta!._id.toString(), { role: SystemRoles.USER }),
      ).resolves.toBeNull();
    });
  });

  it('copies an account profile onto every member record it owns', async () => {
    const alice = await createAccount('alice@example.com');
    const [acme, beta] = await Promise.all([createOrg('Acme', alice), createOrg('Beta', alice)]);
    await orgs.createMembership({ tenantId: acme.tenantId, account: alice, role: 'ADMIN' });
    await orgs.createMembership({ tenantId: beta.tenantId, account: alice, role: 'ADMIN' });

    const synced = await orgs.syncAccountProfileToMembers(alice._id, {
      email: 'alice@new.example.com',
      name: 'Alice New',
    });

    expect(synced).toBe(2);
    for (const tenantId of [acme.tenantId, beta.tenantId]) {
      await expect(orgs.findMembership(alice._id, tenantId)).resolves.toMatchObject({
        email: 'alice@new.example.com',
        name: 'Alice New',
      });
    }
  });

  it('marks a deactivated member inactive for background admission', async () => {
    const alice = await createAccount('alice@example.com');
    const acme = await createOrg('Acme', alice);
    const { member } = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: alice,
      role: 'USER',
    });

    await runInTenant(acme.tenantId, async () => {
      expect(await users.isAgentTriggerPrincipalActive(member._id.toString())).toBe(true);
      await orgs.updateOrganizationMember(member._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      });
      expect(await users.isAgentTriggerPrincipalActive(member._id.toString())).toBe(false);
      expect(await users.isSubagentOwnerAdmissible(member._id.toString())).toBe(false);
    });
  });
});

describe('platform operator', () => {
  it('lets exactly one account be the operator, and hands the role on', async () => {
    const [alice, bob] = await Promise.all([
      createAccount('alice@example.com'),
      createAccount('bob@example.com'),
    ]);

    const claims = await Promise.all([
      orgs.claimPlatformOperator(alice._id),
      orgs.claimPlatformOperator(bob._id),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const first = claims[0] ? alice : bob;
    const second = claims[0] ? bob : alice;
    await expect(orgs.findPlatformOperator()).resolves.toMatchObject({ _id: first._id });

    await expect(orgs.transferPlatformOperator(second._id)).resolves.toBe(true);
    await expect(orgs.findPlatformOperator()).resolves.toMatchObject({ _id: second._id });
    const formerOperator = await runInAccounts(async () =>
      mongoose.models.User.findById(first._id).lean<t.IUser>(),
    );
    expect(formerOperator?.isPlatformOperator).toBeUndefined();
    await expect(orgs.transferPlatformOperator(new mongoose.Types.ObjectId())).resolves.toBe(false);
  });

  it('enters any organization as a hidden admin the organization cannot see or change', async () => {
    const [operator, owner] = await Promise.all([
      createAccount('operator@example.com'),
      createAccount('owner@example.com'),
    ]);
    const acme = await createOrg('Acme', owner);
    const { member: ownerMember } = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: owner,
      role: SystemRoles.ADMIN,
    });

    const access = await orgs.ensureOperatorMembership({
      tenantId: acme.tenantId,
      account: operator,
    });
    expect(access).toMatchObject({
      role: SystemRoles.ADMIN,
      operatorAccess: true,
      status: OrganizationMemberStatus.ACTIVE,
      tenantId: acme.tenantId,
    });
    const again = await orgs.ensureOperatorMembership({
      tenantId: acme.tenantId,
      account: operator,
    });
    expect(again._id.toString()).toBe(access._id.toString());

    await runInTenant(acme.tenantId, async () => {
      const members = await orgs.listOrganizationMembers({ limit: 10 });
      expect(members.map((m) => m.email)).toEqual(['owner@example.com']);
      await expect(orgs.findOrganizationMember(access._id.toString())).resolves.toBeNull();
      await expect(
        orgs.updateOrganizationMember(access._id.toString(), { role: SystemRoles.USER }),
      ).resolves.toBeNull();
      /* The owner is still the organization's only admin. */
      expect(await orgs.countActiveOrganizationAdmins(ownerMember._id.toString())).toBe(0);
      const found = await users.searchUsers({ searchPattern: 'operator' });
      expect(found).toHaveLength(0);
    });
    const memberships = await orgs.listMembershipsForIdentity(operator._id);
    expect(memberships).toEqual([expect.objectContaining({ operatorAccess: true })]);
  });

  it('uses a real active membership as it is, and restores a left one as hidden access', async () => {
    const operator = await createAccount('operator@example.com');
    const [acme, beta] = await Promise.all([
      createOrg('Acme', operator),
      createOrg('Beta', operator),
    ]);
    const { member: own } = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: operator,
      role: SystemRoles.ADMIN,
    });
    const reused = await orgs.ensureOperatorMembership({
      tenantId: acme.tenantId,
      account: operator,
    });
    expect(reused._id.toString()).toBe(own._id.toString());
    expect(reused.operatorAccess).toBeUndefined();

    const { member: left } = await orgs.createMembership({
      tenantId: beta.tenantId,
      account: operator,
      role: SystemRoles.USER,
    });
    await runInTenant(beta.tenantId, () =>
      orgs.updateOrganizationMember(left._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      }),
    );
    const restored = await orgs.ensureOperatorMembership({
      tenantId: beta.tenantId,
      account: operator,
    });
    expect(restored).toMatchObject({
      _id: left._id,
      operatorAccess: true,
      role: SystemRoles.ADMIN,
      status: OrganizationMemberStatus.ACTIVE,
    });
  });
});

describe('pending registration requests', () => {
  it('lets exactly one concurrent sign-in claim the pending organization', async () => {
    const alice = await createAccount('alice@example.com');
    await runInAccounts(() =>
      users.updateUser(alice._id.toString(), { pendingOrganization: { name: 'Acme' } }),
    );

    const claims = await Promise.all(
      Array.from({ length: 5 }, () => orgs.claimPendingOrganization(alice._id)),
    );

    expect(claims.filter(Boolean)).toEqual([{ name: 'Acme' }]);
    await expect(orgs.claimPendingOrganization(alice._id)).resolves.toBeNull();

    await orgs.restorePendingOrganization(alice._id, { name: 'Acme' });
    await expect(orgs.claimPendingOrganization(alice._id)).resolves.toEqual({ name: 'Acme' });
  });

  it('claims a pending link invite once', async () => {
    const alice = await createAccount('alice@example.com');
    const inviteId = new mongoose.Types.ObjectId();
    await runInAccounts(() =>
      users.updateUser(alice._id.toString(), { pendingInviteId: inviteId }),
    );

    await expect(orgs.claimPendingInvite(alice._id)).resolves.toEqual(inviteId);
    await expect(orgs.claimPendingInvite(alice._id)).resolves.toBeNull();
  });

  it('records the organization the next sign-in opens', async () => {
    const alice = await createAccount('alice@example.com');
    await orgs.setLastActiveTenant(alice._id, 'org_next');
    const stored = await runInAccounts(() => users.getUserById(alice._id.toString()));
    expect(stored?.lastActiveTenantId).toBe('org_next');
  });
});

describe('account sessions', () => {
  it('ties member sessions to the account and revokes them across organizations', async () => {
    const alice = await createAccount('alice@example.com');
    const bob = await createAccount('bob@example.com');
    const [acme, beta] = await Promise.all([createOrg('Acme', alice), createOrg('Beta', alice)]);
    const memberships = await Promise.all([
      orgs.createMembership({ tenantId: acme.tenantId, account: alice, role: 'ADMIN' }),
      orgs.createMembership({ tenantId: beta.tenantId, account: alice, role: 'ADMIN' }),
      orgs.createMembership({ tenantId: beta.tenantId, account: bob, role: 'USER' }),
    ]);
    const [aliceAcme, aliceBeta, bobBeta] = memberships.map(({ member }) => member);
    const issue = (member: t.IUser, identityId: string) =>
      runInTenant(member.tenantId!, () =>
        sessions.createSession(member._id.toString(), { identityId }),
      );

    const { session, refreshToken } = await issue(aliceAcme, alice._id.toString());
    await issue(aliceBeta, alice._id.toString());
    await issue(bobBeta, bob._id.toString());

    expect(session.identity?.toString()).toBe(alice._id.toString());
    const payload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64url').toString());
    expect(payload).toMatchObject({ id: aliceAcme._id.toString(), aid: alice._id.toString() });

    const result = await sessions.deleteAllAccountSessions(alice._id.toString());

    expect(result.deletedCount).toBe(2);
    const remaining = await tenantStorage.run({ tenantId: beta.tenantId }, async () =>
      mongoose.models.Session.find({}).lean(),
    );
    expect(remaining.map((s) => s.user.toString())).toEqual([bobBeta._id.toString()]);
  });

  it('rejects a malformed account id', async () => {
    await expect(sessions.deleteAllAccountSessions('not-an-id')).rejects.toThrow(
      'Invalid account ID format',
    );
  });
});

describe('organization invites', () => {
  const day = 24 * 60 * 60 * 1000;

  async function setup() {
    const alice = await createAccount('alice@example.com');
    const acme = await createOrg('Acme', alice);
    const { member } = await orgs.createMembership({
      tenantId: acme.tenantId,
      account: alice,
      role: SystemRoles.ADMIN,
    });
    return { alice, acme, admin: member };
  }

  it('keeps one pending email invite per address, rotating it on re-invite', async () => {
    const { acme, admin } = await setup();
    const base = {
      tenantId: acme.tenantId,
      kind: OrganizationInviteKind.EMAIL,
      email: 'Bob@Example.com ',
      role: SystemRoles.USER,
      invitedBy: admin._id,
      expiresAt: new Date(Date.now() + day),
      maxUses: 1,
    };

    const first = await invites.createOrganizationInvite({ ...base, tokenHash: 'hash-1' });
    const second = await invites.createOrganizationInvite({
      ...base,
      tokenHash: 'hash-2',
      role: SystemRoles.ADMIN,
    });

    expect(second._id.toString()).toBe(first._id.toString());
    expect(second).toMatchObject({
      email: 'bob@example.com',
      tokenHash: 'hash-2',
      role: SystemRoles.ADMIN,
      remainingUses: 1,
      tenantId: acme.tenantId,
    });
    await expect(invites.findOrganizationInviteByTokenHash('hash-1')).resolves.toBeNull();
    await expect(invites.listPendingInvitesForEmail('BOB@example.com')).resolves.toHaveLength(1);
  });

  it('never redeems a link invite beyond its use limit, even concurrently', async () => {
    const { acme, admin } = await setup();
    const invite = await invites.createOrganizationInvite({
      tenantId: acme.tenantId,
      kind: OrganizationInviteKind.LINK,
      tokenHash: 'link-hash',
      role: SystemRoles.USER,
      invitedBy: admin._id,
      expiresAt: new Date(Date.now() + day),
      maxUses: 3,
    });

    const redemptions = await Promise.all(
      Array.from({ length: 6 }, () =>
        invites.redeemOrganizationInvite({
          inviteId: invite._id,
          tenantId: acme.tenantId,
          acceptedBy: new mongoose.Types.ObjectId(),
        }),
      ),
    );

    expect(redemptions.filter(Boolean)).toHaveLength(3);
    const spent = await invites.findOrganizationInvite(invite._id, acme.tenantId);
    expect(spent).toMatchObject({
      remainingUses: 0,
      useCount: 3,
      status: OrganizationInviteStatus.ACCEPTED,
    });

    await invites.releaseOrganizationInviteUse({ inviteId: invite._id, tenantId: acme.tenantId });
    await expect(invites.findOrganizationInvite(invite._id, acme.tenantId)).resolves.toMatchObject({
      remainingUses: 1,
      status: OrganizationInviteStatus.PENDING,
    });
  });

  it('refuses revoked and expired invites', async () => {
    const { acme, admin } = await setup();
    const create = (tokenHash: string, expiresAt: Date) =>
      invites.createOrganizationInvite({
        tenantId: acme.tenantId,
        kind: OrganizationInviteKind.LINK,
        tokenHash,
        role: SystemRoles.USER,
        invitedBy: admin._id,
        expiresAt,
        maxUses: 5,
      });
    const revoked = await create('revoked-hash', new Date(Date.now() + day));
    const expired = await create('expired-hash', new Date(Date.now() - 1000));

    await runInTenant(acme.tenantId, () =>
      invites.revokeOrganizationInvite(revoked._id.toString()),
    );
    const redeem = (inviteId: mongoose.Types.ObjectId) =>
      invites.redeemOrganizationInvite({
        inviteId,
        tenantId: acme.tenantId,
        acceptedBy: admin._id,
      });

    await expect(redeem(revoked._id)).resolves.toBeNull();
    await expect(redeem(expired._id)).resolves.toBeNull();
  });

  it('scopes invite listing, revocation and rotation to the current organization', async () => {
    const { alice, acme, admin } = await setup();
    const beta = await createOrg('Beta', alice);
    const betaInvite = await invites.createOrganizationInvite({
      tenantId: beta.tenantId,
      kind: OrganizationInviteKind.LINK,
      tokenHash: 'beta-hash',
      role: SystemRoles.USER,
      invitedBy: admin._id,
      expiresAt: new Date(Date.now() + day),
      maxUses: 5,
    });

    await runInTenant(acme.tenantId, async () => {
      await expect(invites.listOrganizationInvites()).resolves.toEqual([]);
      await expect(invites.revokeOrganizationInvite(betaInvite._id.toString())).resolves.toBeNull();
      await expect(
        invites.rotateOrganizationInviteToken({
          inviteId: betaInvite._id.toString(),
          tokenHash: 'stolen',
          expiresAt: new Date(Date.now() + day),
          invitedBy: admin._id,
        }),
      ).resolves.toBeNull();
    });
    await expect(invites.findOrganizationInvite(betaInvite._id, acme.tenantId)).resolves.toBeNull();
    await expect(invites.findOrganizationInviteByTokenHash('beta-hash')).resolves.toMatchObject({
      tenantId: beta.tenantId,
    });
  });
});
