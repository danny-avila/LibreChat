import mongoose from 'mongoose';
import { AccessRoleIds } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IAccessRole, ITenant } from '~/types';
import { tenantStorage, runAsSystem } from '~/config/tenantContext';
import { createModels } from '../models';
import { createAccessRoleMethods } from './accessRole';

let mongoServer: MongoMemoryServer;
let AccessRole: mongoose.Model<IAccessRole>;
let Tenant: mongoose.Model<ITenant>;
let methods: ReturnType<typeof createAccessRoleMethods>;
let modelsToCleanup: string[] = [];

const TENANT_A = 'tenant-a-roles';
const TENANT_B = 'tenant-b-roles';

beforeAll(async () => {
  process.env.TENANT_ISOLATION_STRICT = 'true';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  AccessRole = mongoose.models.AccessRole as mongoose.Model<IAccessRole>;
  Tenant = mongoose.models.Tenant as mongoose.Model<ITenant>;
  methods = createAccessRoleMethods(mongoose);
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await AccessRole.deleteMany({});
    await Tenant.deleteMany({});
  });
});

afterAll(async () => {
  delete process.env.TENANT_ISOLATION_STRICT;
  await mongoose.disconnect();
  await mongoServer.stop();
  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }
});

describe('AccessRole tenant isolation', () => {
  it('global seedDefaultRoles is invisible to tenant-scoped queries', async () => {
    await runAsSystem(async () => {
      await methods.seedDefaultRoles();
    });

    const role = await tenantStorage.run({ tenantId: TENANT_A }, async () =>
      methods.findRoleByIdentifier(AccessRoleIds.SKILL_OWNER),
    );

    expect(role).toBeNull();
  });

  it('seedDefaultRolesForTenant creates roles visible only in that tenant', async () => {
    await methods.seedDefaultRolesForTenant(TENANT_A);
    await methods.seedDefaultRolesForTenant(TENANT_B);

    const roleA = await tenantStorage.run({ tenantId: TENANT_A }, async () =>
      methods.findRoleByIdentifier(AccessRoleIds.SKILL_OWNER),
    );
    const roleB = await tenantStorage.run({ tenantId: TENANT_B }, async () =>
      methods.findRoleByIdentifier(AccessRoleIds.SKILL_OWNER),
    );

    expect(roleA?.accessRoleId).toBe(AccessRoleIds.SKILL_OWNER);
    expect(roleB?.accessRoleId).toBe(AccessRoleIds.SKILL_OWNER);
    expect(roleA?.tenantId).toBe(TENANT_A);
    expect(roleB?.tenantId).toBe(TENANT_B);
  });

  it('ensureDefaultRolesForTenant backfills missing tenant roles idempotently', async () => {
    await methods.ensureDefaultRolesForTenant(TENANT_A);
    await methods.ensureDefaultRolesForTenant(TENANT_A);

    const roles = await tenantStorage.run({ tenantId: TENANT_A }, async () =>
      AccessRole.find({}).lean(),
    );

    expect(roles.length).toBe(15);
  });

  it('seedDefaultRolesForAllTenants seeds every tenant from Tenant and User collections', async () => {
    await runAsSystem(async () => {
      await Tenant.create({
        tenantId: TENANT_A,
        name: 'Tenant A',
        status: 'active',
      });
    });

    await methods.seedDefaultRolesForAllTenants();

    const role = await tenantStorage.run({ tenantId: TENANT_A }, async () =>
      methods.findRoleByIdentifier(AccessRoleIds.SKILL_OWNER),
    );

    expect(role).toBeDefined();
    expect(role?.tenantId).toBe(TENANT_A);
  });
});
