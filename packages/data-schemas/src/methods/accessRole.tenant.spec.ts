import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AccessRoleIds, ResourceType } from 'librechat-data-provider';
import { _resetStrictCache } from '../models/plugins/tenantIsolation';
import { createAccessRoleModel } from '~/models/accessRole';
import { createAccessRoleMethods } from './accessRole';
import { tenantStorage } from '~/config/tenantContext';
import { RoleBits } from '~/common';

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createAccessRoleMethods>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  /** Applies the tenant-isolation plugin, which is what scopes these queries */
  createAccessRoleModel(mongoose);
  methods = createAccessRoleMethods(mongoose);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  delete process.env.TENANT_ISOLATION_STRICT;
  _resetStrictCache();
});

/** Seeds the global default roles the way startup does: no tenant context, no `tenantId` */
const seedGlobalRoles = () => methods.seedDefaultRoles();

const createTenantRole = (tenantId: string, role: Parameters<typeof methods.createRole>[0]) =>
  tenantStorage.run({ tenantId }, () => methods.createRole(role));

describe('access role resolution under tenant isolation', () => {
  describe('findRoleByIdentifier', () => {
    it('resolves a global default role from inside a tenant context', async () => {
      await seedGlobalRoles();

      const role = await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
        methods.findRoleByIdentifier(AccessRoleIds.AGENT_OWNER),
      );

      expect(role).toEqual(
        expect.objectContaining({
          accessRoleId: AccessRoleIds.AGENT_OWNER,
          resourceType: ResourceType.AGENT,
          permBits: RoleBits.OWNER,
        }),
      );
    });

    it('resolves a global default role under strict isolation', async () => {
      await seedGlobalRoles();
      process.env.TENANT_ISOLATION_STRICT = 'true';
      _resetStrictCache();

      const role = await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
        methods.findRoleByIdentifier(AccessRoleIds.SKILL_OWNER),
      );

      expect(role).toEqual(expect.objectContaining({ accessRoleId: AccessRoleIds.SKILL_OWNER }));
    });

    it("prefers the tenant's own copy of a role over the global one", async () => {
      await seedGlobalRoles();
      await createTenantRole('tenant-a', {
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        name: 'tenant-owner',
        resourceType: ResourceType.AGENT,
        permBits: RoleBits.EDITOR,
      });

      const scoped = await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
        methods.findRoleByIdentifier(AccessRoleIds.AGENT_OWNER),
      );
      const other = await tenantStorage.run({ tenantId: 'tenant-b' }, () =>
        methods.findRoleByIdentifier(AccessRoleIds.AGENT_OWNER),
      );

      expect(scoped).toEqual(
        expect.objectContaining({ tenantId: 'tenant-a', permBits: RoleBits.EDITOR }),
      );
      expect(other).toEqual(expect.objectContaining({ permBits: RoleBits.OWNER }));
      expect(other?.tenantId).toBeUndefined();
    });

    it("does not resolve another tenant's role", async () => {
      await createTenantRole('tenant-b', {
        accessRoleId: 'tenant_b_owner',
        name: 'tenant-b-owner',
        resourceType: ResourceType.AGENT,
        permBits: RoleBits.OWNER,
      });

      const role = await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
        methods.findRoleByIdentifier('tenant_b_owner'),
      );

      expect(role).toBeNull();
    });

    it('resolves the global role with no tenant context, as before', async () => {
      await seedGlobalRoles();

      await expect(methods.findRoleByIdentifier(AccessRoleIds.AGENT_OWNER)).resolves.toEqual(
        expect.objectContaining({ accessRoleId: AccessRoleIds.AGENT_OWNER }),
      );
    });
  });

  describe('findRolesByResourceType', () => {
    it('returns the global roles for a tenant, with tenant copies overriding', async () => {
      await seedGlobalRoles();
      await createTenantRole('tenant-a', {
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        name: 'tenant-viewer',
        resourceType: ResourceType.AGENT,
        permBits: RoleBits.VIEWER,
      });

      const roles = await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
        methods.findRolesByResourceType(ResourceType.AGENT),
      );

      expect(roles.map((role) => role.accessRoleId).sort()).toEqual(
        [AccessRoleIds.AGENT_EDITOR, AccessRoleIds.AGENT_OWNER, AccessRoleIds.AGENT_VIEWER].sort(),
      );
      expect(roles.find((role) => role.accessRoleId === AccessRoleIds.AGENT_VIEWER)).toEqual(
        expect.objectContaining({ name: 'tenant-viewer', tenantId: 'tenant-a' }),
      );
    });

    it('excludes roles belonging to another tenant', async () => {
      await seedGlobalRoles();
      await createTenantRole('tenant-b', {
        accessRoleId: 'tenant_b_role',
        name: 'tenant-b-role',
        resourceType: ResourceType.AGENT,
        permBits: RoleBits.VIEWER,
      });

      const roles = await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
        methods.findRolesByResourceType(ResourceType.AGENT),
      );

      expect(roles.map((role) => role.accessRoleId)).not.toContain('tenant_b_role');
    });
  });

  describe('getRoleForPermissions', () => {
    it('falls back to the global roles from inside a tenant context', async () => {
      await seedGlobalRoles();

      const role = await tenantStorage.run({ tenantId: 'tenant-a' }, () =>
        methods.getRoleForPermissions(ResourceType.AGENT, RoleBits.OWNER),
      );

      expect(role).toEqual(expect.objectContaining({ accessRoleId: AccessRoleIds.AGENT_OWNER }));
    });
  });
});
