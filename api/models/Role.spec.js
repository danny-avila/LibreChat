const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SystemRoles, PermissionTypes } = require('librechat-data-provider');
const Role = require('~/models/schema/roleSchema');
const { updateAccessPermissions } = require('~/models/Role');
const getLogStores = require('~/cache/getLogStores');

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
});
