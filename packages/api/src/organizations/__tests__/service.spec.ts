import mongoose from 'mongoose';
import {
  runAsSystem,
  runInTenant,
  runInAccounts,
  SystemCapabilities,
} from '@librechat/data-schemas';
import {
  SystemRoles,
  PrincipalType,
  OrganizationErrorCode,
  organizationsConfigSchema,
  OrganizationMemberStatus,
} from 'librechat-data-provider';
import type { IUser, RecordAuditEntryInput } from '@librechat/data-schemas';
import type { TOrganizationsConfig } from 'librechat-data-provider';
import { createOrganizationsHarness } from './helpers/harness';
import { createOrganizationService } from '../service';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const harness = createOrganizationsHarness();
let config: TOrganizationsConfig;
const redeemPendingInvite = jest.fn();

function service(overrides: Partial<Parameters<typeof createOrganizationService>[0]> = {}) {
  return createOrganizationService({
    db: harness.methods,
    getConfig: () => config,
    redeemPendingInvite,
    ...overrides,
  });
}

const adminPrincipals = (memberId: string) => [
  { principalType: PrincipalType.USER, principalId: memberId },
  { principalType: PrincipalType.ROLE, principalId: SystemRoles.ADMIN },
];

beforeAll(() => harness.start());
afterAll(() => harness.stop());
beforeEach(async () => {
  jest.clearAllMocks();
  config = organizationsConfigSchema.parse({ enabled: true });
  await harness.reset();
  await runAsSystem(async () => {
    await Promise.all([
      mongoose.models.Role.deleteMany({}),
      mongoose.models.SystemGrant.deleteMany({}),
      mongoose.models.ResourceLock.deleteMany({}),
    ]);
  });
});

describe('createOrganizationWithAdmin', () => {
  it('creates the organization, its roles, its admin grants and its first admin', async () => {
    const alice = await harness.createAccount('alice@example.com');

    const { organization, member } = await service().createOrganizationWithAdmin(alice, 'Acme');

    expect(organization).toMatchObject({ name: 'Acme', createdBy: alice._id });
    expect(member).toMatchObject({ role: SystemRoles.ADMIN, tenantId: organization.tenantId });
    const roles = await runInTenant(organization.tenantId, async () =>
      mongoose.models.Role.find({}).lean<Array<{ name: string; tenantId: string }>>(),
    );
    expect(roles.map((role) => [role.name, role.tenantId]).sort()).toEqual(
      [
        [SystemRoles.ADMIN, organization.tenantId],
        [SystemRoles.USER, organization.tenantId],
      ].sort(),
    );
    const check = (capability: (typeof SystemCapabilities)[keyof typeof SystemCapabilities]) =>
      harness.methods.hasCapabilityForPrincipals({
        principals: adminPrincipals(member._id.toString()),
        capability,
        tenantId: organization.tenantId,
      });
    await expect(check(SystemCapabilities.MANAGE_USERS)).resolves.toBe(true);
    await expect(check(SystemCapabilities.MANAGE_CONFIGS)).resolves.toBe(false);
    await expect(check(SystemCapabilities.ACCESS_ADMIN)).resolves.toBe(false);
  });

  it('undoes the organization and its grants when the admin cannot be created', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const failing = service({
      db: {
        ...harness.methods,
        createMembership: async () => {
          throw new Error('membership failed');
        },
      },
    });

    await expect(failing.createOrganizationWithAdmin(alice, 'Acme')).rejects.toThrow(
      'membership failed',
    );

    const organizations = await runAsSystem(async () =>
      mongoose.models.Organization.countDocuments({}),
    );
    const grants = await runAsSystem(async () =>
      mongoose.models.SystemGrant.countDocuments({ tenantId: { $exists: true } }),
    );
    expect(organizations).toBe(0);
    expect(grants).toBe(0);
  });
});

describe('materializePendingAccess', () => {
  it('creates the organization requested at registration once', async () => {
    const alice = await harness.createAccount('alice@example.com', {
      pendingOrganization: { name: 'Acme' },
    });
    const organizations = service();

    await organizations.materializePendingAccess(alice);
    await organizations.materializePendingAccess(alice);

    const memberships = await harness.methods.listMembershipsForIdentity(alice._id);
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe(SystemRoles.ADMIN);
  });

  it('puts the request back when the organization cannot be created', async () => {
    const alice = await harness.createAccount('alice@example.com', {
      pendingOrganization: { name: 'Acme' },
    });
    const failing = service({
      db: {
        ...harness.methods,
        createOrganization: async () => {
          throw new Error('database down');
        },
      },
    });

    await expect(failing.materializePendingAccess(alice)).rejects.toThrow('database down');

    const stored = await runInAccounts(() => harness.methods.getUserById(alice._id.toString()));
    expect(stored?.pendingOrganization).toEqual({ name: 'Acme' });
  });

  it('redeems the link invite used at registration and tolerates a spent one', async () => {
    const inviteId = new mongoose.Types.ObjectId();
    const alice = await harness.createAccount('alice@example.com', { pendingInviteId: inviteId });
    redeemPendingInvite.mockRejectedValueOnce(new Error('exhausted'));

    await expect(service().materializePendingAccess(alice)).resolves.toBeUndefined();

    expect(redeemPendingInvite).toHaveBeenCalledWith(alice, inviteId.toString());
  });
});

describe('createOrganizationForAccount', () => {
  it('validates the name and requires a verified email', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const carol = await harness.createAccount('carol@example.com', { emailVerified: false });
    const organizations = service();

    await expect(organizations.createOrganizationForAccount(alice, ' ')).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.ORG_NAME_INVALID },
    });
    await expect(organizations.createOrganizationForAccount(carol, 'Acme')).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.EMAIL_NOT_VERIFIED },
    });
    const created = await organizations.createOrganizationForAccount(alice, '  Acme \n Inc  ');
    expect(created.ok && created.value.organization.name).toBe('Acme Inc');
  });

  it('enforces allowCreate and maxPerAccount', async () => {
    const alice = await harness.createAccount('alice@example.com');
    await harness.createOrganizationWithMember(alice);

    config = organizationsConfigSchema.parse({ enabled: true, allowCreate: false });
    await expect(service().createOrganizationForAccount(alice, 'Beta')).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.ORG_CREATE_DISABLED },
    });

    config = organizationsConfigSchema.parse({ enabled: true, maxPerAccount: 1 });
    await expect(service().createOrganizationForAccount(alice, 'Beta')).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.ORG_LIMIT_REACHED },
    });

    config = organizationsConfigSchema.parse({ enabled: false });
    await expect(service().createOrganizationForAccount(alice, 'Beta')).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.ORGANIZATIONS_DISABLED },
    });
  });
});

describe('listAccountOrganizations', () => {
  it('lists active memberships by name and flags the current one', async () => {
    const alice = await harness.createAccount('alice@example.com');
    const organizations = service();
    const { organization: zeta } = await organizations.createOrganizationWithAdmin(alice, 'Zeta');
    const { organization: acme } = await organizations.createOrganizationWithAdmin(alice, 'Acme');
    const { organization: gone, member } = await organizations.createOrganizationWithAdmin(
      alice,
      'Gone',
    );
    await runInTenant(gone.tenantId, () =>
      harness.methods.updateOrganizationMember(member._id.toString(), {
        status: OrganizationMemberStatus.DEACTIVATED,
      }),
    );

    const list = await organizations.listAccountOrganizations(alice._id.toString(), zeta.tenantId);

    expect(list.map((entry) => [entry.organization.name, entry.current])).toEqual([
      ['Acme', false],
      ['Zeta', true],
    ]);
    expect(list[0].organization.id).toBe(acme.tenantId);
  });
});

describe('member management', () => {
  async function organizationWithMembers(overrides: Parameters<typeof service>[0] = {}) {
    const organizations = service(overrides);
    const alice = await harness.createAccount('alice@example.com');
    const bob = await harness.createAccount('bob@example.com');
    const { organization, member: aliceMember } = await organizations.createOrganizationWithAdmin(
      alice,
      'Acme',
    );
    const { member: bobMember } = await harness.methods.createMembership({
      tenantId: organization.tenantId,
      account: bob,
      role: SystemRoles.USER,
    });
    const actor = (member: IUser) => ({
      id: member._id.toString(),
      role: member.role,
      tenantId: organization.tenantId,
      name: member.name,
    });
    return { organizations, organization, aliceMember, bobMember, actor };
  }

  it('lets an admin promote a member, and nobody else make admins', async () => {
    const { organizations, organization, aliceMember, bobMember, actor } =
      await organizationWithMembers();

    await runInTenant(organization.tenantId, async () => {
      await expect(
        organizations.changeMemberRole(
          actor(bobMember),
          aliceMember._id.toString(),
          SystemRoles.ADMIN,
        ),
      ).resolves.toMatchObject({ ok: true });
      await expect(
        organizations.changeMemberRole(
          actor(bobMember),
          bobMember._id.toString(),
          SystemRoles.ADMIN,
        ),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: OrganizationErrorCode.ROLE_NOT_ASSIGNABLE },
      });
      await expect(
        organizations.changeMemberRole(actor(aliceMember), bobMember._id.toString(), 'NOPE'),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: OrganizationErrorCode.ROLE_NOT_FOUND },
      });

      const promoted = await organizations.changeMemberRole(
        actor(aliceMember),
        bobMember._id.toString(),
        SystemRoles.ADMIN,
      );
      expect(promoted.ok && promoted.value.role).toBe(SystemRoles.ADMIN);
    });
  });

  it('never leaves the organization without an admin, even under concurrent demotions', async () => {
    const { organizations, organization, aliceMember, bobMember, actor } =
      await organizationWithMembers();

    await runInTenant(organization.tenantId, async () => {
      await expect(
        organizations.changeMemberRole(
          actor(aliceMember),
          aliceMember._id.toString(),
          SystemRoles.USER,
        ),
      ).resolves.toMatchObject({ ok: false, error: { code: OrganizationErrorCode.LAST_ADMIN } });
      await expect(organizations.leaveOrganization(actor(aliceMember))).resolves.toMatchObject({
        ok: false,
        error: { code: OrganizationErrorCode.LAST_ADMIN },
      });

      await organizations.changeMemberRole(
        actor(aliceMember),
        bobMember._id.toString(),
        SystemRoles.ADMIN,
      );
      const bobAdmin = { ...actor(bobMember), role: SystemRoles.ADMIN };
      const results = await Promise.all([
        organizations.changeMemberRole(
          actor(aliceMember),
          bobMember._id.toString(),
          SystemRoles.USER,
        ),
        organizations.changeMemberRole(bobAdmin, aliceMember._id.toString(), SystemRoles.USER),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(await harness.methods.countActiveOrganizationAdmins()).toBe(1);
    });
  });

  it('deactivates a member, ending its sessions in the organization', async () => {
    const { organizations, organization, aliceMember, bobMember, actor } =
      await organizationWithMembers();
    await runInTenant(organization.tenantId, () =>
      harness.methods.createSession(bobMember._id.toString(), {
        identityId: bobMember.identityId?.toString(),
      }),
    );

    const result = await runInTenant(organization.tenantId, () =>
      organizations.deactivateMember(actor(aliceMember), bobMember._id.toString()),
    );

    expect(result.ok && result.value.status).toBe(OrganizationMemberStatus.DEACTIVATED);
    const sessions = await runInTenant(organization.tenantId, async () =>
      mongoose.models.Session.countDocuments({ user: bobMember._id }),
    );
    expect(sessions).toBe(0);
  });

  it('cannot reach a member of another organization', async () => {
    const { organizations, aliceMember, actor } = await organizationWithMembers();
    const carol = await harness.createAccount('carol@example.com');
    const other = await harness.createOrganizationWithMember(carol, SystemRoles.USER);

    const result = await runInTenant(aliceMember.tenantId!, () =>
      organizations.deactivateMember(actor(aliceMember), other.member._id.toString()),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.MEMBER_NOT_FOUND },
    });
  });

  it('renames the current organization with a validated name', async () => {
    const { organizations, aliceMember, actor } = await organizationWithMembers();

    await expect(
      organizations.renameCurrentOrganization(actor(aliceMember), 'Acme Corp'),
    ).resolves.toMatchObject({ ok: true, value: { name: 'Acme Corp' } });
    await expect(
      organizations.renameCurrentOrganization(actor(aliceMember), 'x'.repeat(81)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: OrganizationErrorCode.ORG_NAME_INVALID },
    });
  });

  it('records lifecycle and membership changes on the organization chain', async () => {
    const recordAuditEntry = jest.fn<Promise<null>, [RecordAuditEntryInput]>(async () => null);
    const { organizations, organization, aliceMember, bobMember, actor } =
      await organizationWithMembers({ recordAuditEntry });
    const carol = await harness.createAccount('carol@example.com');
    const { member: carolMember } = await harness.methods.createMembership({
      tenantId: organization.tenantId,
      account: carol,
      role: SystemRoles.USER,
    });

    await runInTenant(organization.tenantId, async () => {
      await organizations.changeMemberRole(
        actor(aliceMember),
        bobMember._id.toString(),
        SystemRoles.ADMIN,
      );
      await organizations.deactivateMember(actor(aliceMember), carolMember._id.toString());
      await organizations.leaveOrganization({ ...actor(bobMember), role: SystemRoles.ADMIN });
      await organizations.renameCurrentOrganization(actor(aliceMember), 'Acme Corp');
      /* Rejected changes record nothing. */
      await organizations.renameCurrentOrganization(actor(aliceMember), 'x');
    });

    const entries = recordAuditEntry.mock.calls.map(([entry]) => entry);
    expect(entries.map((entry) => entry.action)).toEqual([
      'organization.created',
      'organization.member_role_changed',
      'organization.member_deactivated',
      'organization.member_left',
      'organization.renamed',
    ]);
    expect(entries.every((entry) => entry.tenantId === organization.tenantId)).toBe(true);
    expect(entries[0]).toMatchObject({
      actor: { type: 'user', id: aliceMember._id.toString() },
      target: { type: 'organization', id: organization.tenantId, name: 'Acme' },
    });
    expect(entries[1]).toMatchObject({
      target: { type: 'user', id: bobMember._id.toString() },
      metadata: { from: SystemRoles.USER, to: SystemRoles.ADMIN },
    });
    expect(entries[2]).toMatchObject({ target: { id: carolMember._id.toString() } });
    expect(entries[3]).toMatchObject({
      actor: { id: bobMember._id.toString() },
      target: { id: bobMember._id.toString() },
    });
  });
});

describe('the platform operator entering organizations', () => {
  it('enters any organization through hidden access, audited on the platform chain only', async () => {
    const recordAuditEntry = jest.fn<Promise<null>, [RecordAuditEntryInput]>(async () => null);
    const organizations = service({ recordAuditEntry });
    const owner = await harness.createAccount('owner@example.com');
    const operator = await harness.createAccount('operator@example.com', {
      isPlatformOperator: true,
    });
    const { organization } = await organizations.createOrganizationWithAdmin(owner, 'Acme');
    recordAuditEntry.mockClear();

    await expect(
      organizations.enterAsOperator({ ...owner, isPlatformOperator: false }, organization.tenantId),
    ).resolves.toMatchObject({ ok: false, error: { code: OrganizationErrorCode.NOT_A_MEMBER } });

    await expect(organizations.enterAsOperator(operator, organization.tenantId)).resolves.toEqual({
      ok: true,
      value: { tenantId: organization.tenantId },
    });
    const access = await harness.methods.findMembership(operator._id, organization.tenantId);
    expect(access).toMatchObject({ operatorAccess: true, role: SystemRoles.ADMIN });
    expect(recordAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'organization.operator_entered',
        tenantId: undefined,
        metadata: { organization: organization.tenantId },
      }),
    );

    /* The visit is not one of the operator's organizations, except while it is in it. */
    await expect(organizations.listAccountOrganizations(operator._id.toString())).resolves.toEqual(
      [],
    );
    await expect(
      organizations.listAccountOrganizations(operator._id.toString(), organization.tenantId),
    ).resolves.toEqual([
      expect.objectContaining({ current: true, visiting: true, role: SystemRoles.ADMIN }),
    ]);
  });

  it('enters its own organization as itself, and never one being deleted', async () => {
    const recordAuditEntry = jest.fn<Promise<null>, [RecordAuditEntryInput]>(async () => null);
    const organizations = service({ recordAuditEntry });
    const operator = await harness.createAccount('operator@example.com', {
      isPlatformOperator: true,
    });
    const { organization } = await organizations.createOrganizationWithAdmin(operator, 'Ops');
    recordAuditEntry.mockClear();

    await organizations.enterAsOperator(operator, organization.tenantId);
    const own = await harness.methods.findMembership(operator._id, organization.tenantId);
    expect(own?.operatorAccess).toBeUndefined();
    expect(recordAuditEntry).not.toHaveBeenCalled();

    await harness.methods.setOrganizationStatus(organization.tenantId, 'deleting');
    await expect(
      organizations.enterAsOperator(operator, organization.tenantId),
    ).resolves.toMatchObject({ ok: false });
  });
});
