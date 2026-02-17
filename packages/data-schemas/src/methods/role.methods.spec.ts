import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SystemRoles, Permissions, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import type { IRole, RolePermissions } from '..';
import { createRoleMethods } from './role';
import { createModels } from '../models';

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockGetCache = jest.fn().mockReturnValue(mockCache);

let Role: mongoose.Model<IRole>;
let getRoleByName: ReturnType<typeof createRoleMethods>['getRoleByName'];
let updateAccessPermissions: ReturnType<typeof createRoleMethods>['updateAccessPermissions'];
let initializeRoles: ReturnType<typeof createRoleMethods>['initializeRoles'];
let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  createModels(mongoose);
  Role = mongoose.models.Role;
  const methods = createRoleMethods(mongoose, { getCache: mockGetCache });
  getRoleByName = methods.getRoleByName;
  updateAccessPermissions = methods.updateAccessPermissions;
  initializeRoles = methods.initializeRoles;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Role.deleteMany({});
  mockGetCache.mockClear();
  mockCache.get.mockClear();
  mockCache.set.mockClear();
  mockCache.del.mockClear();
});

describe('updateAccessPermissions', () => {
  it('should update permissions when changes are needed', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: {
          CREATE: true,
          USE: true,
          SHARE: false,
        },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARE: true,
      },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: true,
      SHARE: true,
    });
  });

  it('should not update permissions when no changes are needed', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: {
          CREATE: true,
          USE: true,
          SHARE: false,
        },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARE: false,
      },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: true,
      SHARE: false,
    });
  });

  it('should handle non-existent roles', async () => {
    await updateAccessPermissions('NON_EXISTENT_ROLE', {
      [PermissionTypes.PROMPTS]: { CREATE: true },
    });
    const role = await Role.findOne({ name: 'NON_EXISTENT_ROLE' });
    expect(role).toBeNull();
  });

  it('should update only specified permissions', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: {
          CREATE: true,
          USE: true,
          SHARE: false,
        },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { SHARE: true },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: true,
      SHARE: true,
    });
  });

  it('should handle partial updates', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: {
          CREATE: true,
          USE: true,
          SHARE: false,
        },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { USE: false },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: false,
      SHARE: false,
    });
  });

  it('should update multiple permission types at once', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: { CREATE: true, USE: true, SHARE: false },
        [PermissionTypes.BOOKMARKS]: { USE: true },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { USE: false, SHARE: true },
      [PermissionTypes.BOOKMARKS]: { USE: false },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: false,
      SHARE: true,
    });
    expect(updatedRole.permissions[PermissionTypes.BOOKMARKS]).toEqual({ USE: false });
  });

  it('should handle updates for a single permission type', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: { CREATE: true, USE: true, SHARE: false },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { USE: false, SHARE: true },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: false,
      SHARE: true,
    });
  });

  it('should update MULTI_CONVO permissions', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.MULTI_CONVO]: { USE: false },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.MULTI_CONVO]: { USE: true },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.MULTI_CONVO]).toEqual({ USE: true });
  });

  it('should update MULTI_CONVO permissions along with other permission types', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: { CREATE: true, USE: true, SHARE: false },
        [PermissionTypes.MULTI_CONVO]: { USE: false },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { SHARE: true },
      [PermissionTypes.MULTI_CONVO]: { USE: true },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: true,
      SHARE: true,
    });
    expect(updatedRole.permissions[PermissionTypes.MULTI_CONVO]).toEqual({ USE: true });
  });

  it('should inherit SHARED_GLOBAL value into SHARE when SHARE is absent from both DB and update', async () => {
    // Simulates the startup backfill path: caller sends SHARE_PUBLIC but not SHARE;
    // migration should inherit SHARED_GLOBAL to preserve the deployment's sharing intent.
    await Role.collection.insertOne({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: { USE: true, CREATE: true, SHARED_GLOBAL: true },
        [PermissionTypes.AGENTS]: { USE: true, CREATE: true, SHARED_GLOBAL: false },
      },
    });

    await updateAccessPermissions(SystemRoles.USER, {
      // No explicit SHARE — migration should inherit from SHARED_GLOBAL
      [PermissionTypes.PROMPTS]: { SHARE_PUBLIC: false },
      [PermissionTypes.AGENTS]: { SHARE_PUBLIC: false },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);

    // SHARED_GLOBAL=true → SHARE=true (inherited)
    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARE).toBe(true);
    // SHARED_GLOBAL=false → SHARE=false (inherited)
    expect(updatedRole.permissions[PermissionTypes.AGENTS].SHARE).toBe(false);
    // SHARED_GLOBAL cleaned up
    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARED_GLOBAL).toBeUndefined();
    expect(updatedRole.permissions[PermissionTypes.AGENTS].SHARED_GLOBAL).toBeUndefined();
  });

  it('should respect explicit SHARE in update payload and not override it with SHARED_GLOBAL', async () => {
    // Caller explicitly passes SHARE: false even though SHARED_GLOBAL=true in DB.
    // The explicit intent must win; migration must not silently overwrite it.
    await Role.collection.insertOne({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: { USE: true, SHARED_GLOBAL: true },
      },
    });

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { SHARE: false }, // explicit false — should be preserved
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);

    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARE).toBe(false);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARED_GLOBAL).toBeUndefined();
  });

  it('should migrate SHARED_GLOBAL to SHARE even when the permType is not in the update payload', async () => {
    // Bug #2 regression: cleanup block removes SHARED_GLOBAL but migration block only
    // runs when the permType is in the update payload. Without the fix, SHARE would be
    // lost when any other permType (e.g. MULTI_CONVO) is the only thing being updated.
    await Role.collection.insertOne({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: {
          USE: true,
          SHARED_GLOBAL: true, // legacy — NO SHARE present
        },
        [PermissionTypes.MULTI_CONVO]: { USE: false },
      },
    });

    // Only update MULTI_CONVO — PROMPTS is intentionally absent from the payload
    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.MULTI_CONVO]: { USE: true },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);

    // SHARE should have been inherited from SHARED_GLOBAL, not silently dropped
    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARE).toBe(true);
    // SHARED_GLOBAL should be removed
    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARED_GLOBAL).toBeUndefined();
    // Original USE should be untouched
    expect(updatedRole.permissions[PermissionTypes.PROMPTS].USE).toBe(true);
    // The actual update should have applied
    expect(updatedRole.permissions[PermissionTypes.MULTI_CONVO].USE).toBe(true);
  });

  it('should remove orphaned SHARED_GLOBAL when SHARE already exists and permType is not in update', async () => {
    // Safe cleanup case: SHARE already set, SHARED_GLOBAL is just orphaned noise.
    // SHARE must not be changed; SHARED_GLOBAL must be removed.
    await Role.collection.insertOne({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: {
          USE: true,
          SHARE: true, // already migrated
          SHARED_GLOBAL: true, // orphaned
        },
        [PermissionTypes.MULTI_CONVO]: { USE: false },
      },
    });

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.MULTI_CONVO]: { USE: true },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);

    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARED_GLOBAL).toBeUndefined();
    expect(updatedRole.permissions[PermissionTypes.PROMPTS].SHARE).toBe(true);
    expect(updatedRole.permissions[PermissionTypes.MULTI_CONVO].USE).toBe(true);
  });

  it('should not update MULTI_CONVO permissions when no changes are needed', async () => {
    await new Role({
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.MULTI_CONVO]: { USE: true },
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.MULTI_CONVO]: { USE: true },
    });

    const updatedRole = await getRoleByName(SystemRoles.USER);
    expect(updatedRole.permissions[PermissionTypes.MULTI_CONVO]).toEqual({ USE: true });
  });
});

describe('initializeRoles', () => {
  beforeEach(async () => {
    await Role.deleteMany({});
  });

  it('should create default roles if they do not exist', async () => {
    await initializeRoles();

    const adminRole = await getRoleByName(SystemRoles.ADMIN);
    const userRole = await getRoleByName(SystemRoles.USER);

    expect(adminRole).toBeTruthy();
    expect(userRole).toBeTruthy();

    // Check if all permission types exist in the permissions field
    Object.values(PermissionTypes).forEach((permType) => {
      expect(adminRole.permissions[permType]).toBeDefined();
      expect(userRole.permissions[permType]).toBeDefined();
    });

    // Example: Check default values for ADMIN role
    expect(adminRole.permissions[PermissionTypes.PROMPTS]?.SHARE).toBe(true);
    expect(adminRole.permissions[PermissionTypes.BOOKMARKS]?.USE).toBe(true);
    expect(adminRole.permissions[PermissionTypes.AGENTS]?.CREATE).toBe(true);
  });

  it('should not modify existing permissions for existing roles', async () => {
    const customUserRole = {
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]: {
          [Permissions.USE]: false,
          [Permissions.CREATE]: true,
          [Permissions.SHARE]: true,
        },
        [PermissionTypes.BOOKMARKS]: { [Permissions.USE]: false },
      },
    };

    await new Role(customUserRole).save();
    await initializeRoles();

    const userRole = await getRoleByName(SystemRoles.USER);
    expect(userRole.permissions[PermissionTypes.PROMPTS]).toEqual(
      customUserRole.permissions[PermissionTypes.PROMPTS],
    );
    expect(userRole.permissions[PermissionTypes.BOOKMARKS]).toEqual(
      customUserRole.permissions[PermissionTypes.BOOKMARKS],
    );
    expect(userRole.permissions[PermissionTypes.AGENTS]).toBeDefined();
  });

  it('should add new permission types to existing roles', async () => {
    const partialUserRole = {
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]:
          roleDefaults[SystemRoles.USER].permissions[PermissionTypes.PROMPTS],
        [PermissionTypes.BOOKMARKS]:
          roleDefaults[SystemRoles.USER].permissions[PermissionTypes.BOOKMARKS],
      },
    };

    await new Role(partialUserRole).save();
    await initializeRoles();

    const userRole = await getRoleByName(SystemRoles.USER);
    expect(userRole.permissions[PermissionTypes.AGENTS]).toBeDefined();
    expect(userRole.permissions[PermissionTypes.AGENTS]?.CREATE).toBeDefined();
    expect(userRole.permissions[PermissionTypes.AGENTS]?.USE).toBeDefined();
    expect(userRole.permissions[PermissionTypes.AGENTS]?.SHARE).toBeDefined();
  });

  it('should handle multiple runs without duplicating or modifying data', async () => {
    await initializeRoles();
    await initializeRoles();

    const adminRoles = await Role.find({ name: SystemRoles.ADMIN });
    const userRoles = await Role.find({ name: SystemRoles.USER });

    expect(adminRoles).toHaveLength(1);
    expect(userRoles).toHaveLength(1);

    const adminPerms = adminRoles[0].toObject().permissions as RolePermissions;
    const userPerms = userRoles[0].toObject().permissions as RolePermissions;
    Object.values(PermissionTypes).forEach((permType) => {
      expect(adminPerms[permType]).toBeDefined();
      expect(userPerms[permType]).toBeDefined();
    });
  });

  it('should update roles with missing permission types from roleDefaults', async () => {
    const partialAdminRole = {
      name: SystemRoles.ADMIN,
      permissions: {
        [PermissionTypes.PROMPTS]: {
          [Permissions.USE]: false,
          [Permissions.CREATE]: false,
          [Permissions.SHARE]: false,
        },
        [PermissionTypes.BOOKMARKS]:
          roleDefaults[SystemRoles.ADMIN].permissions[PermissionTypes.BOOKMARKS],
      },
    };

    await new Role(partialAdminRole).save();
    await initializeRoles();

    const adminRole = await getRoleByName(SystemRoles.ADMIN);
    expect(adminRole.permissions[PermissionTypes.PROMPTS]).toEqual(
      partialAdminRole.permissions[PermissionTypes.PROMPTS],
    );
    expect(adminRole.permissions[PermissionTypes.AGENTS]).toBeDefined();
    expect(adminRole.permissions[PermissionTypes.AGENTS]?.CREATE).toBeDefined();
    expect(adminRole.permissions[PermissionTypes.AGENTS]?.USE).toBeDefined();
    expect(adminRole.permissions[PermissionTypes.AGENTS]?.SHARE).toBeDefined();
  });

  it('should include MULTI_CONVO permissions when creating default roles', async () => {
    await initializeRoles();

    const adminRole = await getRoleByName(SystemRoles.ADMIN);
    const userRole = await getRoleByName(SystemRoles.USER);

    expect(adminRole.permissions[PermissionTypes.MULTI_CONVO]).toBeDefined();
    expect(userRole.permissions[PermissionTypes.MULTI_CONVO]).toBeDefined();
    expect(adminRole.permissions[PermissionTypes.MULTI_CONVO]?.USE).toBe(
      roleDefaults[SystemRoles.ADMIN].permissions[PermissionTypes.MULTI_CONVO].USE,
    );
    expect(userRole.permissions[PermissionTypes.MULTI_CONVO]?.USE).toBe(
      roleDefaults[SystemRoles.USER].permissions[PermissionTypes.MULTI_CONVO].USE,
    );
  });

  it('should add MULTI_CONVO permissions to existing roles without them', async () => {
    const partialUserRole = {
      name: SystemRoles.USER,
      permissions: {
        [PermissionTypes.PROMPTS]:
          roleDefaults[SystemRoles.USER].permissions[PermissionTypes.PROMPTS],
        [PermissionTypes.BOOKMARKS]:
          roleDefaults[SystemRoles.USER].permissions[PermissionTypes.BOOKMARKS],
      },
    };

    await new Role(partialUserRole).save();
    await initializeRoles();

    const userRole = await getRoleByName(SystemRoles.USER);
    expect(userRole.permissions[PermissionTypes.MULTI_CONVO]).toBeDefined();
    expect(userRole.permissions[PermissionTypes.MULTI_CONVO]?.USE).toBeDefined();
  });
});
