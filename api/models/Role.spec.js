const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  Permissions,
  roleDefaults,
  PermissionTypes,
} = require('librechat-data-provider');
const { getRoleByName, updateAccessPermissions } = require('~/models/Role');
const getLogStores = require('~/cache/getLogStores');
const { initializeRoles } = require('~/models');
const { Role } = require('~/db/models');

// Mock the cache
jest.mock('~/cache/getLogStores', () =>
  jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }),
);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Role.deleteMany({});
  getLogStores.mockClear();
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
    expect(adminRole.permissions[PermissionTypes.PROMPTS].SHARE).toBe(true);
    expect(adminRole.permissions[PermissionTypes.BOOKMARKS].USE).toBe(true);
    expect(adminRole.permissions[PermissionTypes.AGENTS].CREATE).toBe(true);
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
    expect(userRole.permissions[PermissionTypes.AGENTS].CREATE).toBeDefined();
    expect(userRole.permissions[PermissionTypes.AGENTS].USE).toBeDefined();
    expect(userRole.permissions[PermissionTypes.AGENTS].SHARE).toBeDefined();
  });

  it('should handle multiple runs without duplicating or modifying data', async () => {
    await initializeRoles();
    await initializeRoles();

    const adminRoles = await Role.find({ name: SystemRoles.ADMIN });
    const userRoles = await Role.find({ name: SystemRoles.USER });

    expect(adminRoles).toHaveLength(1);
    expect(userRoles).toHaveLength(1);

    const adminPerms = adminRoles[0].toObject().permissions;
    const userPerms = userRoles[0].toObject().permissions;
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
    expect(adminRole.permissions[PermissionTypes.AGENTS].CREATE).toBeDefined();
    expect(adminRole.permissions[PermissionTypes.AGENTS].USE).toBeDefined();
    expect(adminRole.permissions[PermissionTypes.AGENTS].SHARE).toBeDefined();
  });

  it('should include MULTI_CONVO permissions when creating default roles', async () => {
    await initializeRoles();

    const adminRole = await getRoleByName(SystemRoles.ADMIN);
    const userRole = await getRoleByName(SystemRoles.USER);

    expect(adminRole.permissions[PermissionTypes.MULTI_CONVO]).toBeDefined();
    expect(userRole.permissions[PermissionTypes.MULTI_CONVO]).toBeDefined();
    expect(adminRole.permissions[PermissionTypes.MULTI_CONVO].USE).toBe(
      roleDefaults[SystemRoles.ADMIN].permissions[PermissionTypes.MULTI_CONVO].USE,
    );
    expect(userRole.permissions[PermissionTypes.MULTI_CONVO].USE).toBe(
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
    expect(userRole.permissions[PermissionTypes.MULTI_CONVO].USE).toBeDefined();
  });
});
