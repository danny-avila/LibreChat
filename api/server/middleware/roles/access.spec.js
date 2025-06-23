const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { checkAccess, generateCheckAccess } = require('./access');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const { Role } = require('~/db/models');

// Mock only the logger
jest.mock('~/config', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Access Middleware', () => {
  let mongoServer;
  let req, res, next;

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
    await mongoose.connection.dropDatabase();

    // Create test roles
    await Role.create({
      name: 'user',
      permissions: {
        [PermissionTypes.AGENTS]: {
          [Permissions.USE]: true,
          [Permissions.CREATE]: false,
          [Permissions.SHARED_GLOBAL]: false,
        },
      },
    });

    await Role.create({
      name: 'admin',
      permissions: {
        [PermissionTypes.AGENTS]: {
          [Permissions.USE]: true,
          [Permissions.CREATE]: true,
          [Permissions.SHARED_GLOBAL]: true,
        },
      },
    });

    req = {
      user: { id: 'user123', role: 'user' },
      body: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('checkAccess', () => {
    test('should return false if user is not provided', async () => {
      const result = await checkAccess(null, PermissionTypes.AGENTS, [Permissions.USE]);
      expect(result).toBe(false);
    });

    test('should return true if user has required permission', async () => {
      const result = await checkAccess(req.user, PermissionTypes.AGENTS, [Permissions.USE]);
      expect(result).toBe(true);
    });

    test('should return false if user lacks required permission', async () => {
      const result = await checkAccess(req.user, PermissionTypes.AGENTS, [Permissions.CREATE]);
      expect(result).toBe(false);
    });

    test('should return true if user has any of multiple permissions', async () => {
      const result = await checkAccess(req.user, PermissionTypes.AGENTS, [
        Permissions.USE,
        Permissions.CREATE,
      ]);
      expect(result).toBe(true);
    });

    test('should check body properties when permission is not directly granted', async () => {
      // User role doesn't have CREATE permission, but bodyProps allows it
      const bodyProps = {
        [Permissions.CREATE]: ['agentId', 'name'],
      };

      const checkObject = { agentId: 'agent123' };

      const result = await checkAccess(
        req.user,
        PermissionTypes.AGENTS,
        [Permissions.CREATE],
        bodyProps,
        checkObject,
      );
      expect(result).toBe(true);
    });

    test('should return false if role is not found', async () => {
      req.user.role = 'nonexistent';
      const result = await checkAccess(req.user, PermissionTypes.AGENTS, [Permissions.USE]);
      expect(result).toBe(false);
    });

    test('should return false if role has no permissions for the requested type', async () => {
      await Role.create({
        name: 'limited',
        permissions: {
          // Explicitly set AGENTS permissions to false
          [PermissionTypes.AGENTS]: {
            [Permissions.USE]: false,
            [Permissions.CREATE]: false,
            [Permissions.SHARED_GLOBAL]: false,
          },
          // Has permissions for other types
          [PermissionTypes.PROMPTS]: {
            [Permissions.USE]: true,
          },
        },
      });
      req.user.role = 'limited';

      const result = await checkAccess(req.user, PermissionTypes.AGENTS, [Permissions.USE]);
      expect(result).toBe(false);
    });

    test('should handle admin role with all permissions', async () => {
      req.user.role = 'admin';

      const createResult = await checkAccess(req.user, PermissionTypes.AGENTS, [
        Permissions.CREATE,
      ]);
      expect(createResult).toBe(true);

      const shareResult = await checkAccess(req.user, PermissionTypes.AGENTS, [
        Permissions.SHARED_GLOBAL,
      ]);
      expect(shareResult).toBe(true);
    });
  });

  describe('generateCheckAccess', () => {
    test('should call next() when user has required permission', async () => {
      const middleware = generateCheckAccess(PermissionTypes.AGENTS, [Permissions.USE]);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should return 403 when user lacks permission', async () => {
      const middleware = generateCheckAccess(PermissionTypes.AGENTS, [Permissions.CREATE]);
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden: Insufficient permissions' });
    });

    test('should check body properties when configured', async () => {
      req.body = { agentId: 'agent123', description: 'test' };

      const bodyProps = {
        [Permissions.CREATE]: ['agentId'],
      };

      const middleware = generateCheckAccess(
        PermissionTypes.AGENTS,
        [Permissions.CREATE],
        bodyProps,
      );
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should handle database errors gracefully', async () => {
      // Create a user with an invalid role that will cause getRoleByName to fail
      req.user.role = { invalid: 'object' }; // This will cause an error when querying

      const middleware = generateCheckAccess(PermissionTypes.AGENTS, [Permissions.USE]);
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.stringContaining('Server error:'),
      });
    });

    test('should work with multiple permission types', async () => {
      req.user.role = 'admin';

      const middleware = generateCheckAccess(PermissionTypes.AGENTS, [
        Permissions.USE,
        Permissions.CREATE,
        Permissions.SHARED_GLOBAL,
      ]);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should handle missing user gracefully', async () => {
      req.user = null;

      const middleware = generateCheckAccess(PermissionTypes.AGENTS, [Permissions.USE]);
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.stringContaining('Server error:'),
      });
    });

    test('should handle role with no AGENTS permissions', async () => {
      await Role.create({
        name: 'noaccess',
        permissions: {
          // Explicitly set AGENTS with all permissions false
          [PermissionTypes.AGENTS]: {
            [Permissions.USE]: false,
            [Permissions.CREATE]: false,
            [Permissions.SHARED_GLOBAL]: false,
          },
        },
      });
      req.user.role = 'noaccess';

      const middleware = generateCheckAccess(PermissionTypes.AGENTS, [Permissions.USE]);
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden: Insufficient permissions' });
    });
  });
});
