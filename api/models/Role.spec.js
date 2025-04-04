const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  SystemRoles,
  PermissionTypes,
  roleDefaults,
  Permissions,
} = require('librechat-data-provider');
const { updateAccessPermissions, initializeRoles } = require('~/models/Role');
const getLogStores = require('~/cache/getLogStores');
const { Role } = require('~/models/Role');

// Mock the cache
jest.mock('~/cache/getLogStores', () => {
  return jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  });
});

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
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: false,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: true,
      },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: true,
      SHARED_GLOBAL: true,
    });
  });

  it('should not update permissions when no changes are needed', async () => {
    await new Role({
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: false,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: false,
      },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: true,
      SHARED_GLOBAL: false,
    });
  });

  it('should handle non-existent roles', async () => {
    await updateAccessPermissions('NON_EXISTENT_ROLE', {
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
      },
    });

    const role = await Role.findOne({ name: 'NON_EXISTENT_ROLE' });
    expect(role).toBeNull();
  });

  it('should update only specified permissions', async () => {
    await new Role({
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: false,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: {
        SHARED_GLOBAL: true,
      },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: true,
      SHARED_GLOBAL: true,
    });
  });

  it('should handle partial updates', async () => {
    await new Role({
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: false,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: {
        USE: false,
      },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: false,
      SHARED_GLOBAL: false,
    });
  });

  it('should update multiple permission types at once', async () => {
    await new Role({
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: false,
      },
      [PermissionTypes.BOOKMARKS]: {
        USE: true,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { USE: false, SHARED_GLOBAL: true },
      [PermissionTypes.BOOKMARKS]: { USE: false },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: false,
      SHARED_GLOBAL: true,
    });
    expect(updatedRole[PermissionTypes.BOOKMARKS]).toEqual({
      USE: false,
    });
  });

  it('should handle updates for a single permission type', async () => {
    await new Role({
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: false,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { USE: false, SHARED_GLOBAL: true },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: false,
      SHARED_GLOBAL: true,
    });
  });

  it('should update MULTI_CONVO permissions', async () => {
    await new Role({
      name: SystemRoles.USER,
      [PermissionTypes.MULTI_CONVO]: {
        USE: false,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.MULTI_CONVO]: {
        USE: true,
      },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.MULTI_CONVO]).toEqual({
      USE: true,
    });
  });

  it('should update MULTI_CONVO permissions along with other permission types', async () => {
    await new Role({
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: {
        CREATE: true,
        USE: true,
        SHARED_GLOBAL: false,
      },
      [PermissionTypes.MULTI_CONVO]: {
        USE: false,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.PROMPTS]: { SHARED_GLOBAL: true },
      [PermissionTypes.MULTI_CONVO]: { USE: true },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.PROMPTS]).toEqual({
      CREATE: true,
      USE: true,
      SHARED_GLOBAL: true,
    });
    expect(updatedRole[PermissionTypes.MULTI_CONVO]).toEqual({
      USE: true,
    });
  });

  it('should not update MULTI_CONVO permissions when no changes are needed', async () => {
    await new Role({
      name: SystemRoles.USER,
      [PermissionTypes.MULTI_CONVO]: {
        USE: true,
      },
    }).save();

    await updateAccessPermissions(SystemRoles.USER, {
      [PermissionTypes.MULTI_CONVO]: {
        USE: true,
      },
    });

    const updatedRole = await Role.findOne({ name: SystemRoles.USER }).lean();
    expect(updatedRole[PermissionTypes.MULTI_CONVO]).toEqual({
      USE: true,
    });
  });
});

describe('initializeRoles', () => {
  beforeEach(async () => {
    await Role.deleteMany({});
  });

  it('should create default roles if they do not exist', async () => {
    await initializeRoles();

    const adminRole = await Role.findOne({ name: SystemRoles.ADMIN }).lean();
    const userRole = await Role.findOne({ name: SystemRoles.USER }).lean();

    expect(adminRole).toBeTruthy();
    expect(userRole).toBeTruthy();

    // Check if all permission types exist
    Object.values(PermissionTypes).forEach((permType) => {
      expect(adminRole[permType]).toBeDefined();
      expect(userRole[permType]).toBeDefined();
    });

    // Check if permissions match defaults (example for ADMIN role)
    expect(adminRole[PermissionTypes.PROMPTS].SHARED_GLOBAL).toBe(true);
    expect(adminRole[PermissionTypes.BOOKMARKS].USE).toBe(true);
    expect(adminRole[PermissionTypes.AGENTS].CREATE).toBe(true);
  });

  it('should not modify existing permissions for existing roles', async () => {
    const customUserRole = {
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: false,
        [Permissions.CREATE]: true,
        [Permissions.SHARED_GLOBAL]: true,
      },
      [PermissionTypes.BOOKMARKS]: {
        [Permissions.USE]: false,
      },
    };

    await new Role(customUserRole).save();

    await initializeRoles();

    const userRole = await Role.findOne({ name: SystemRoles.USER }).lean();

    expect(userRole[PermissionTypes.PROMPTS]).toEqual(customUserRole[PermissionTypes.PROMPTS]);
    expect(userRole[PermissionTypes.BOOKMARKS]).toEqual(customUserRole[PermissionTypes.BOOKMARKS]);
    expect(userRole[PermissionTypes.AGENTS]).toBeDefined();
  });

  it('should add new permission types to existing roles', async () => {
    const partialUserRole = {
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: roleDefaults[SystemRoles.USER][PermissionTypes.PROMPTS],
      [PermissionTypes.BOOKMARKS]: roleDefaults[SystemRoles.USER][PermissionTypes.BOOKMARKS],
    };

    await new Role(partialUserRole).save();

    await initializeRoles();

    const userRole = await Role.findOne({ name: SystemRoles.USER }).lean();

    expect(userRole[PermissionTypes.AGENTS]).toBeDefined();
    expect(userRole[PermissionTypes.AGENTS].CREATE).toBeDefined();
    expect(userRole[PermissionTypes.AGENTS].USE).toBeDefined();
    expect(userRole[PermissionTypes.AGENTS].SHARED_GLOBAL).toBeDefined();
  });

  it('should handle multiple runs without duplicating or modifying data', async () => {
    await initializeRoles();
    await initializeRoles();

    const adminRoles = await Role.find({ name: SystemRoles.ADMIN });
    const userRoles = await Role.find({ name: SystemRoles.USER });

    expect(adminRoles).toHaveLength(1);
    expect(userRoles).toHaveLength(1);

    const adminRole = adminRoles[0].toObject();
    const userRole = userRoles[0].toObject();

    // Check if all permission types exist
    Object.values(PermissionTypes).forEach((permType) => {
      expect(adminRole[permType]).toBeDefined();
      expect(userRole[permType]).toBeDefined();
    });
  });

  it('should update roles with missing permission types from roleDefaults', async () => {
    const partialAdminRole = {
      name: SystemRoles.ADMIN,
      [PermissionTypes.PROMPTS]: {
        [Permissions.USE]: false,
        [Permissions.CREATE]: false,
        [Permissions.SHARED_GLOBAL]: false,
      },
      [PermissionTypes.BOOKMARKS]: roleDefaults[SystemRoles.ADMIN][PermissionTypes.BOOKMARKS],
    };

    await new Role(partialAdminRole).save();

    await initializeRoles();

    const adminRole = await Role.findOne({ name: SystemRoles.ADMIN }).lean();

    expect(adminRole[PermissionTypes.PROMPTS]).toEqual(partialAdminRole[PermissionTypes.PROMPTS]);
    expect(adminRole[PermissionTypes.AGENTS]).toBeDefined();
    expect(adminRole[PermissionTypes.AGENTS].CREATE).toBeDefined();
    expect(adminRole[PermissionTypes.AGENTS].USE).toBeDefined();
    expect(adminRole[PermissionTypes.AGENTS].SHARED_GLOBAL).toBeDefined();
  });

  it('should include MULTI_CONVO permissions when creating default roles', async () => {
    await initializeRoles();

    const adminRole = await Role.findOne({ name: SystemRoles.ADMIN }).lean();
    const userRole = await Role.findOne({ name: SystemRoles.USER }).lean();

    expect(adminRole[PermissionTypes.MULTI_CONVO]).toBeDefined();
    expect(userRole[PermissionTypes.MULTI_CONVO]).toBeDefined();

    // Check if MULTI_CONVO permissions match defaults
    expect(adminRole[PermissionTypes.MULTI_CONVO].USE).toBe(
      roleDefaults[SystemRoles.ADMIN][PermissionTypes.MULTI_CONVO].USE,
    );
    expect(userRole[PermissionTypes.MULTI_CONVO].USE).toBe(
      roleDefaults[SystemRoles.USER][PermissionTypes.MULTI_CONVO].USE,
    );
  });

  it('should add MULTI_CONVO permissions to existing roles without them', async () => {
    const partialUserRole = {
      name: SystemRoles.USER,
      [PermissionTypes.PROMPTS]: roleDefaults[SystemRoles.USER][PermissionTypes.PROMPTS],
      [PermissionTypes.BOOKMARKS]: roleDefaults[SystemRoles.USER][PermissionTypes.BOOKMARKS],
    };

    await new Role(partialUserRole).save();

    await initializeRoles();

    const userRole = await Role.findOne({ name: SystemRoles.USER }).lean();

    expect(userRole[PermissionTypes.MULTI_CONVO]).toBeDefined();
    expect(userRole[PermissionTypes.MULTI_CONVO].USE).toBeDefined();
  });
});
