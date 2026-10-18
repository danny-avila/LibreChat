import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalType, SystemRoles } from 'librechat-data-provider';
import type * as t from '~/types';
import { ACCOUNTS_TENANT_ID, SYSTEM_TENANT_ID } from '~/config/tenantContext';
import { SystemCapabilities } from '~/admin/capabilities';
import { createSystemGrantMethods } from './systemGrant';
import systemGrantSchema from '~/schema/systemGrant';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let SystemGrant: mongoose.Model<t.ISystemGrant>;
let inherited: ReturnType<typeof createSystemGrantMethods>;
let isolated: ReturnType<typeof createSystemGrantMethods>;

const ORG_A = 'org_a';
const ORG_B = 'org_b';
const memberId = new Types.ObjectId();
const orgAdminPrincipals = [
  { principalType: PrincipalType.USER, principalId: memberId },
  { principalType: PrincipalType.ROLE, principalId: SystemRoles.ADMIN },
  { principalType: PrincipalType.PUBLIC },
];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  SystemGrant =
    mongoose.models.SystemGrant || mongoose.model<t.ISystemGrant>('SystemGrant', systemGrantSchema);
  inherited = createSystemGrantMethods(mongoose);
  isolated = createSystemGrantMethods(mongoose, { isolatePlatformRoleGrants: () => true });
  await mongoose.connect(mongoServer.getUri());
  await SystemGrant.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await SystemGrant.deleteMany({});
  await inherited.seedSystemGrants();
});

describe('platform ROLE:ADMIN grants inside a tenant', () => {
  it('apply to a tenant ADMIN when isolation is off (the single-tenant default)', async () => {
    await expect(
      inherited.hasCapabilityForPrincipals({
        principals: orgAdminPrincipals,
        capability: SystemCapabilities.MANAGE_CONFIGS,
        tenantId: ORG_A,
      }),
    ).resolves.toBe(true);
  });

  it('give an organization ADMIN nothing once isolated', async () => {
    const check = (capability: t.ISystemGrant['capability']) =>
      isolated.hasCapabilityForPrincipals({
        principals: orgAdminPrincipals,
        capability,
        tenantId: ORG_A,
      });

    await expect(check(SystemCapabilities.MANAGE_CONFIGS)).resolves.toBe(false);
    await expect(check(SystemCapabilities.ACCESS_ADMIN)).resolves.toBe(false);
    await expect(check('manage:configs:endpoints')).resolves.toBe(false);
    await expect(
      isolated.getHeldCapabilities({
        principals: orgAdminPrincipals,
        capabilities: [SystemCapabilities.MANAGE_USERS, SystemCapabilities.MANAGE_CONFIGS],
        tenantId: ORG_A,
      }),
    ).resolves.toEqual(new Set());
    await expect(
      isolated.hasAnyConfigReadAccess({ principals: orgAdminPrincipals, tenantId: ORG_A }),
    ).resolves.toBe(false);
    await expect(
      isolated.getCapabilitiesForPrincipals({
        principals: orgAdminPrincipals.filter(
          (p): p is typeof p & { principalId: Types.ObjectId | string } => p.principalId != null,
        ),
        tenantId: ORG_A,
      }),
    ).resolves.toEqual([]);
    await expect(
      isolated.getCapabilitiesForPrincipal({
        principalType: PrincipalType.ROLE,
        principalId: SystemRoles.ADMIN,
        tenantId: ORG_A,
      }),
    ).resolves.toEqual([]);
  });

  it('still apply to the untenanted platform ADMIN', async () => {
    await expect(
      isolated.hasCapabilityForPrincipals({
        principals: [{ principalType: PrincipalType.ROLE, principalId: SystemRoles.ADMIN }],
        capability: SystemCapabilities.MANAGE_CONFIGS,
      }),
    ).resolves.toBe(true);
  });

  it('keep a platform grant made to one specific user', async () => {
    await inherited.grantCapability({
      principalType: PrincipalType.USER,
      principalId: memberId,
      capability: SystemCapabilities.READ_USAGE,
    });

    await expect(
      isolated.hasCapabilityForPrincipals({
        principals: orgAdminPrincipals,
        capability: SystemCapabilities.READ_USAGE,
        tenantId: ORG_A,
      }),
    ).resolves.toBe(true);
  });

  it('drop a platform grant made to a group', async () => {
    const groupId = new Types.ObjectId();
    await inherited.grantCapability({
      principalType: PrincipalType.GROUP,
      principalId: groupId,
      capability: SystemCapabilities.READ_USAGE,
    });

    await expect(
      isolated.hasCapabilityForPrincipals({
        principals: [{ principalType: PrincipalType.GROUP, principalId: groupId }],
        capability: SystemCapabilities.READ_USAGE,
        tenantId: ORG_A,
      }),
    ).resolves.toBe(false);
  });

  it('are left out of a tenant grant listing', async () => {
    await isolated.syncOrganizationAdminGrants(ORG_A, [SystemCapabilities.MANAGE_USERS]);

    const listed = await isolated.listGrants({ tenantId: ORG_A, limit: 200 });
    const counted = await isolated.countGrants({ tenantId: ORG_A });

    expect(listed.map((grant) => [grant.capability, grant.tenantId])).toEqual([
      [SystemCapabilities.MANAGE_USERS, ORG_A],
    ]);
    expect(counted).toBe(1);
  });
});

describe('syncOrganizationAdminGrants', () => {
  it('grants an organization ADMIN only the configured capabilities, in its own tenant', async () => {
    const result = await isolated.syncOrganizationAdminGrants(ORG_A, [
      SystemCapabilities.MANAGE_USERS,
      SystemCapabilities.READ_AUDIT_LOG,
    ]);

    expect(result).toEqual({ granted: 2, revoked: 0 });
    const check = (capability: t.ISystemGrant['capability'], tenantId: string) =>
      isolated.hasCapabilityForPrincipals({
        principals: orgAdminPrincipals,
        capability,
        tenantId,
      });
    await expect(check(SystemCapabilities.MANAGE_USERS, ORG_A)).resolves.toBe(true);
    /* `manage:users` implies `read:users`. */
    await expect(check(SystemCapabilities.READ_USERS, ORG_A)).resolves.toBe(true);
    await expect(check(SystemCapabilities.MANAGE_CONFIGS, ORG_A)).resolves.toBe(false);
    await expect(check(SystemCapabilities.MANAGE_USERS, ORG_B)).resolves.toBe(false);
  });

  it('is idempotent and removes capabilities dropped from the configured set', async () => {
    await isolated.syncOrganizationAdminGrants(ORG_A, [
      SystemCapabilities.MANAGE_USERS,
      SystemCapabilities.MANAGE_ROLES,
    ]);
    await isolated.syncOrganizationAdminGrants(ORG_B, [SystemCapabilities.MANAGE_ROLES]);

    const again = await isolated.syncOrganizationAdminGrants(ORG_A, [
      SystemCapabilities.MANAGE_USERS,
    ]);

    expect(again).toEqual({ granted: 0, revoked: 1 });
    const orgA = await SystemGrant.find({ tenantId: ORG_A }).lean();
    expect(orgA.map((grant) => grant.capability)).toEqual([SystemCapabilities.MANAGE_USERS]);
    /* Another organization and the platform grants are untouched. */
    await expect(SystemGrant.countDocuments({ tenantId: ORG_B })).resolves.toBe(1);
    await expect(
      SystemGrant.countDocuments({
        tenantId: { $exists: false },
        capability: SystemCapabilities.MANAGE_ROLES,
      }),
    ).resolves.toBe(1);
  });

  it('keeps a grant the operator assigned by hand through every reconcile', async () => {
    await isolated.syncOrganizationAdminGrants(ORG_A, [SystemCapabilities.MANAGE_USERS]);
    await isolated.grantCapability({
      principalType: PrincipalType.ROLE,
      principalId: SystemRoles.ADMIN,
      capability: SystemCapabilities.MANAGE_MCP_SERVERS,
      tenantId: ORG_A,
      grantedBy: new Types.ObjectId(),
    });

    const again = await isolated.syncOrganizationAdminGrants(ORG_A, [
      SystemCapabilities.MANAGE_USERS,
    ]);

    expect(again.revoked).toBe(0);
    const orgA = await SystemGrant.find({ tenantId: ORG_A }).lean();
    expect(orgA.map((grant) => grant.capability).sort()).toEqual(
      [SystemCapabilities.MANAGE_MCP_SERVERS, SystemCapabilities.MANAGE_USERS].sort(),
    );
  });

  it('converges concurrent syncs on one grant per capability', async () => {
    await Promise.all(
      Array.from({ length: 4 }, () =>
        isolated.syncOrganizationAdminGrants(ORG_A, [SystemCapabilities.MANAGE_GROUPS]),
      ),
    );

    await expect(SystemGrant.countDocuments({ tenantId: ORG_A })).resolves.toBe(1);
  });

  it.each([ACCOUNTS_TENANT_ID, SYSTEM_TENANT_ID, ''])('refuses the tenant id %p', async (id) => {
    await expect(
      isolated.syncOrganizationAdminGrants(id, [SystemCapabilities.MANAGE_USERS]),
    ).rejects.toThrow('A real organization tenant id is required');
  });
});
