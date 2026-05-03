import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SystemRoles, Permissions, roleDefaults, PermissionTypes } from 'librechat-data-provider';
import type { IRole, IUser, RolePermissions } from '..';
import { createRoleMethods } from './role';
import { createModels } from '../models';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockGetCache = jest.fn().mockReturnValue(mockCache);

let Role: mongoose.Model<IRole>;
let User: mongoose.Model<IUser>;
let getRoleByName: ReturnType<typeof createRoleMethods>['getRoleByName'];
let updateAccessPermissions: ReturnType<typeof createRoleMethods>['updateAccessPermissions'];
let initializeRoles: ReturnType<typeof createRoleMethods>['initializeRoles'];
let createRoleByName: ReturnType<typeof createRoleMethods>['createRoleByName'];
let deleteRoleByName: ReturnType<typeof createRoleMethods>['deleteRoleByName'];
let updateUsersByRole: ReturnType<typeof createRoleMethods>['updateUsersByRole'];
let listUsersByRole: ReturnType<typeof createRoleMethods>['listUsersByRole'];
let countUsersByRole: ReturnType<typeof createRoleMethods>['countUsersByRole'];
let updateRoleByName: ReturnType<typeof createRoleMethods>['updateRoleByName'];
let listRoles: ReturnType<typeof createRoleMethods>['listRoles'];
let countRoles: ReturnType<typeof createRoleMethods>['countRoles'];
let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  createModels(mongoose);
  Role = mongoose.models.Role;
  User = mongoose.models.User as mongoose.Model<IUser>;
  const methods = createRoleMethods(mongoose, { getCache: mockGetCache });
  getRoleByName = methods.getRoleByName;
  updateAccessPermissions = methods.updateAccessPermissions;
  initializeRoles = methods.initializeRoles;
  createRoleByName = methods.createRoleByName;
  deleteRoleByName = methods.deleteRoleByName;
  updateRoleByName = methods.updateRoleByName;
  updateUsersByRole = methods.updateUsersByRole;
  listUsersByRole = methods.listUsersByRole;
  countUsersByRole = methods.countUsersByRole;
  listRoles = methods.listRoles;
  countRoles = methods.countRoles;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Role.deleteMany({});
  await User.deleteMany({});
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
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]!.SHARE).toBe(true);
    // SHARED_GLOBAL=false → SHARE=false (inherited)
    expect(updatedRole.permissions[PermissionTypes.AGENTS]!.SHARE).toBe(false);
    // SHARED_GLOBAL cleaned up
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).not.toHaveProperty('SHARED_GLOBAL');
    expect(updatedRole.permissions[PermissionTypes.AGENTS]).not.toHaveProperty('SHARED_GLOBAL');
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

    expect(updatedRole.permissions[PermissionTypes.PROMPTS]!.SHARE).toBe(false);
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).not.toHaveProperty('SHARED_GLOBAL');
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
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]!.SHARE).toBe(true);
    // SHARED_GLOBAL should be removed
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).not.toHaveProperty('SHARED_GLOBAL');
    // Original USE should be untouched
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]!.USE).toBe(true);
    // The actual update should have applied
    expect(updatedRole.permissions[PermissionTypes.MULTI_CONVO]!.USE).toBe(true);
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

    expect(updatedRole.permissions[PermissionTypes.PROMPTS]).not.toHaveProperty('SHARED_GLOBAL');
    expect(updatedRole.permissions[PermissionTypes.PROMPTS]!.SHARE).toBe(true);
    expect(updatedRole.permissions[PermissionTypes.MULTI_CONVO]!.USE).toBe(true);
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

describe('createRoleByName', () => {
  it('creates a custom role and caches it', async () => {
    const role = await createRoleByName({ name: 'editor', description: 'Can edit' });

    expect(role.name).toBe('editor');
    expect(role.description).toBe('Can edit');
    expect(mockCache.set).toHaveBeenCalledWith(
      'editor',
      expect.objectContaining({ name: 'editor' }),
    );

    const persisted = await Role.findOne({ name: 'editor' }).lean();
    expect(persisted).toBeTruthy();
  });

  it('trims whitespace from role name', async () => {
    const role = await createRoleByName({ name: '  editor  ' });

    expect(role.name).toBe('editor');
  });

  it('throws when name is empty', async () => {
    await expect(createRoleByName({ name: '' })).rejects.toThrow('Role name is required');
  });

  it('throws when name is whitespace-only', async () => {
    await expect(createRoleByName({ name: '   ' })).rejects.toThrow('Role name is required');
  });

  it('throws when name is undefined', async () => {
    await expect(createRoleByName({})).rejects.toThrow('Role name is required');
  });

  it('throws for reserved system role names', async () => {
    await expect(createRoleByName({ name: SystemRoles.ADMIN })).rejects.toThrow(
      /reserved system name/,
    );
    await expect(createRoleByName({ name: SystemRoles.USER })).rejects.toThrow(
      /reserved system name/,
    );
  });

  it('throws when role already exists', async () => {
    await createRoleByName({ name: 'editor' });

    await expect(createRoleByName({ name: 'editor' })).rejects.toThrow(/already exists/);
  });
});

describe('deleteRoleByName', () => {
  it('deletes a custom role and reassigns users to USER', async () => {
    await createRoleByName({ name: 'editor' });
    await User.create([
      { name: 'Alice', email: 'alice@test.com', role: 'editor', username: 'alice' },
      { name: 'Bob', email: 'bob@test.com', role: 'editor', username: 'bob' },
      { name: 'Carol', email: 'carol@test.com', role: SystemRoles.USER, username: 'carol' },
    ]);

    const deleted = await deleteRoleByName('editor');

    expect(deleted).toBeTruthy();
    expect(deleted!.name).toBe('editor');

    const alice = await User.findOne({ email: 'alice@test.com' }).lean();
    const bob = await User.findOne({ email: 'bob@test.com' }).lean();
    const carol = await User.findOne({ email: 'carol@test.com' }).lean();
    expect(alice!.role).toBe(SystemRoles.USER);
    expect(bob!.role).toBe(SystemRoles.USER);
    expect(carol!.role).toBe(SystemRoles.USER);
  });

  it('returns null when role does not exist', async () => {
    const result = await deleteRoleByName('nonexistent');
    expect(result).toBeNull();
  });

  it('throws for system roles', async () => {
    await expect(deleteRoleByName(SystemRoles.ADMIN)).rejects.toThrow(/Cannot delete system role/);
    await expect(deleteRoleByName(SystemRoles.USER)).rejects.toThrow(/Cannot delete system role/);
  });

  it('sets cache entry to null after deletion', async () => {
    await createRoleByName({ name: 'editor' });
    mockCache.set.mockClear();

    await deleteRoleByName('editor');

    expect(mockCache.set).toHaveBeenCalledWith('editor', null);
  });

  it('returns null and invalidates cache when role does not exist', async () => {
    mockCache.set.mockClear();

    const result = await deleteRoleByName('nonexistent');

    expect(result).toBeNull();
    expect(mockCache.set).toHaveBeenCalledWith('nonexistent', null);
  });
});

describe('updateRoleByName - cache on rename', () => {
  it('invalidates old key and populates new key on rename', async () => {
    await createRoleByName({ name: 'editor', description: 'Can edit' });
    mockCache.set.mockClear();

    const updated = await updateRoleByName('editor', { name: 'senior-editor' });

    expect(updated.name).toBe('senior-editor');
    expect(mockCache.set).toHaveBeenCalledWith('editor', null);
    expect(mockCache.set).toHaveBeenCalledWith(
      'senior-editor',
      expect.objectContaining({ name: 'senior-editor' }),
    );
  });

  it('writes same key when name unchanged', async () => {
    await createRoleByName({ name: 'editor' });
    mockCache.set.mockClear();

    await updateRoleByName('editor', { description: 'Updated desc' });

    expect(mockCache.set).toHaveBeenCalledWith(
      'editor',
      expect.objectContaining({ name: 'editor', description: 'Updated desc' }),
    );
    expect(mockCache.set).toHaveBeenCalledTimes(1);
  });
});

describe('listUsersByRole', () => {
  it('returns users matching the role', async () => {
    await User.create([
      { name: 'Alice', email: 'alice@test.com', role: 'editor', username: 'alice' },
      { name: 'Bob', email: 'bob@test.com', role: 'editor', username: 'bob' },
      { name: 'Carol', email: 'carol@test.com', role: SystemRoles.USER, username: 'carol' },
    ]);

    const users = await listUsersByRole('editor');

    expect(users).toHaveLength(2);
    const names = users.map((u) => u.name).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('returns empty array when no users have the role', async () => {
    const users = await listUsersByRole('nonexistent');
    expect(users).toEqual([]);
  });

  it('respects limit and offset for pagination', async () => {
    await User.create([
      { name: 'Alice', email: 'a@test.com', role: 'editor', username: 'a' },
      { name: 'Bob', email: 'b@test.com', role: 'editor', username: 'b' },
      { name: 'Carol', email: 'c@test.com', role: 'editor', username: 'c' },
      { name: 'Dave', email: 'd@test.com', role: 'editor', username: 'd' },
      { name: 'Eve', email: 'e@test.com', role: 'editor', username: 'e' },
    ]);

    const page1 = await listUsersByRole('editor', { limit: 2, offset: 0 });
    const page2 = await listUsersByRole('editor', { limit: 2, offset: 2 });
    const page3 = await listUsersByRole('editor', { limit: 2, offset: 4 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page3).toHaveLength(1);

    const allIds = [...page1, ...page2, ...page3].map((u) => u._id!.toString());
    expect(new Set(allIds).size).toBe(5);
  });

  it('selects only expected fields', async () => {
    await User.create({
      name: 'Alice',
      email: 'alice@test.com',
      role: 'editor',
      username: 'alice',
      password: 'secret123',
    });

    const users = await listUsersByRole('editor');

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Alice');
    expect(users[0].email).toBe('alice@test.com');
    expect(users[0]._id).toBeDefined();
    expect('password' in users[0]).toBe(false);
    expect('username' in users[0]).toBe(false);
  });
});

describe('updateUsersByRole', () => {
  it('migrates all users from one role to another', async () => {
    await User.create([
      { name: 'Alice', email: 'alice@test.com', role: 'editor', username: 'alice' },
      { name: 'Bob', email: 'bob@test.com', role: 'editor', username: 'bob' },
      { name: 'Carol', email: 'carol@test.com', role: SystemRoles.USER, username: 'carol' },
    ]);

    await updateUsersByRole('editor', 'senior-editor');

    const alice = await User.findOne({ email: 'alice@test.com' }).lean();
    const bob = await User.findOne({ email: 'bob@test.com' }).lean();
    const carol = await User.findOne({ email: 'carol@test.com' }).lean();
    expect(alice!.role).toBe('senior-editor');
    expect(bob!.role).toBe('senior-editor');
    expect(carol!.role).toBe(SystemRoles.USER);
  });

  it('is a no-op when no users have the source role', async () => {
    await User.create({
      name: 'Alice',
      email: 'alice@test.com',
      role: SystemRoles.USER,
      username: 'alice',
    });

    await updateUsersByRole('nonexistent', 'new-role');

    const alice = await User.findOne({ email: 'alice@test.com' }).lean();
    expect(alice!.role).toBe(SystemRoles.USER);
  });
});

describe('countUsersByRole', () => {
  it('returns the count of users with the given role', async () => {
    await User.create([
      { name: 'Alice', email: 'alice@test.com', role: 'editor', username: 'alice' },
      { name: 'Bob', email: 'bob@test.com', role: 'editor', username: 'bob' },
      { name: 'Carol', email: 'carol@test.com', role: SystemRoles.USER, username: 'carol' },
    ]);

    expect(await countUsersByRole('editor')).toBe(2);
    expect(await countUsersByRole(SystemRoles.USER)).toBe(1);
  });

  it('returns 0 when no users have the role', async () => {
    expect(await countUsersByRole('nonexistent')).toBe(0);
  });
});

describe('listRoles', () => {
  beforeEach(async () => {
    await Role.deleteMany({});
  });

  it('returns roles sorted alphabetically by name', async () => {
    await Role.create([
      { name: 'zebra', permissions: {} },
      { name: 'alpha', permissions: {} },
      { name: 'middle', permissions: {} },
    ]);

    const roles = await listRoles();

    expect(roles.map((r) => r.name)).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('respects limit and offset for pagination', async () => {
    await Role.create([
      { name: 'a-role', permissions: {} },
      { name: 'b-role', permissions: {} },
      { name: 'c-role', permissions: {} },
      { name: 'd-role', permissions: {} },
      { name: 'e-role', permissions: {} },
    ]);

    const page1 = await listRoles({ limit: 2, offset: 0 });
    const page2 = await listRoles({ limit: 2, offset: 2 });
    const page3 = await listRoles({ limit: 2, offset: 4 });

    expect(page1).toHaveLength(2);
    expect(page1.map((r) => r.name)).toEqual(['a-role', 'b-role']);
    expect(page2).toHaveLength(2);
    expect(page2.map((r) => r.name)).toEqual(['c-role', 'd-role']);
    expect(page3).toHaveLength(1);
    expect(page3.map((r) => r.name)).toEqual(['e-role']);
  });

  it('defaults to limit 50 and offset 0', async () => {
    await Role.create({ name: 'only-role', permissions: {} });

    const roles = await listRoles();

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe('only-role');
  });

  it('returns only name and description fields', async () => {
    await Role.create({
      name: 'editor',
      description: 'Can edit',
      permissions: { PROMPTS: { USE: true } },
    });

    const roles = await listRoles();

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe('editor');
    expect(roles[0].description).toBe('Can edit');
    expect(roles[0]._id).toBeDefined();
    expect('permissions' in roles[0]).toBe(false);
  });

  it('returns empty array when no roles exist', async () => {
    const roles = await listRoles();
    expect(roles).toEqual([]);
  });

  it('returns undefined description for pre-existing roles without the field', async () => {
    await Role.collection.insertOne({ name: 'legacy', permissions: {} });

    const roles = await listRoles();

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe('legacy');
    expect(roles[0].description).toBeUndefined();
  });
});

describe('countRoles', () => {
  beforeEach(async () => {
    await Role.deleteMany({});
  });

  it('returns the total number of roles', async () => {
    await Role.create([
      { name: 'a', permissions: {} },
      { name: 'b', permissions: {} },
      { name: 'c', permissions: {} },
    ]);

    expect(await countRoles()).toBe(3);
  });

  it('returns 0 when no roles exist', async () => {
    expect(await countRoles()).toBe(0);
  });
});

describe('createRoleByName - duplicate key race', () => {
  beforeEach(async () => {
    await Role.deleteMany({});
  });

  it('throws RoleConflictError on concurrent insert (11000)', async () => {
    await createRoleByName({ name: 'editor' });

    const insertSpy = jest.spyOn(Role.prototype, 'save').mockImplementationOnce(() => {
      const err = new Error('E11000 duplicate key error') as Error & { code: number };
      err.code = 11000;
      throw err;
    });

    await expect(createRoleByName({ name: 'editor2' })).rejects.toThrow(/already exists/);

    insertSpy.mockRestore();
  });
});
