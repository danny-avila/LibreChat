const mongoose = require('mongoose');
const { RoleBits } = require('@librechat/data-schemas');
const { MongoMemoryServer } = require('mongodb-memory-server');
const {
  bulkUpdateResourcePermissions,
  getEffectivePermissions,
  findAccessibleResources,
  getAvailableRoles,
  grantPermission,
  checkPermission,
} = require('./PermissionService');
const { findRoleByIdentifier, getUserPrincipals } = require('~/models');
const { AclEntry, AccessRole } = require('~/db/models');

// Mock the getTransactionSupport function for testing
jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  getTransactionSupport: jest.fn().mockResolvedValue(false),
}));

// Mock GraphApiService to prevent config loading issues
jest.mock('~/server/services/GraphApiService', () => ({
  getGroupMembers: jest.fn().mockResolvedValue([]),
}));

// Mock the logger
jest.mock('~/config', () => ({
  logger: {
    error: jest.fn(),
  },
}));

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
  await mongoose.connection.dropDatabase();
  // Seed some roles for testing
  await AccessRole.create([
    {
      accessRoleId: 'agent_viewer',
      name: 'Agent Viewer',
      description: 'Can view agents',
      resourceType: 'agent',
      permBits: RoleBits.VIEWER, // VIEW permission
    },
    {
      accessRoleId: 'agent_editor',
      name: 'Agent Editor',
      description: 'Can edit agents',
      resourceType: 'agent',
      permBits: RoleBits.EDITOR, // VIEW + EDIT permissions
    },
    {
      accessRoleId: 'agent_owner',
      name: 'Agent Owner',
      description: 'Full control over agents',
      resourceType: 'agent',
      permBits: RoleBits.OWNER, // VIEW + EDIT + DELETE + SHARE permissions
    },
    {
      accessRoleId: 'project_viewer',
      name: 'Project Viewer',
      description: 'Can view projects',
      resourceType: 'project',
      permBits: RoleBits.VIEWER,
    },
    {
      accessRoleId: 'project_editor',
      name: 'Project Editor',
      description: 'Can edit projects',
      resourceType: 'project',
      permBits: RoleBits.EDITOR,
    },
    {
      accessRoleId: 'project_manager',
      name: 'Project Manager',
      description: 'Can manage projects',
      resourceType: 'project',
      permBits: RoleBits.MANAGER,
    },
    {
      accessRoleId: 'project_owner',
      name: 'Project Owner',
      description: 'Full control over projects',
      resourceType: 'project',
      permBits: RoleBits.OWNER,
    },
  ]);
});

// Mock getUserPrincipals to avoid depending on the actual implementation
jest.mock('~/models', () => ({
  ...jest.requireActual('~/models'),
  getUserPrincipals: jest.fn(),
}));

describe('PermissionService', () => {
  // Common test data
  const userId = new mongoose.Types.ObjectId();
  const groupId = new mongoose.Types.ObjectId();
  const resourceId = new mongoose.Types.ObjectId();
  const grantedById = new mongoose.Types.ObjectId();

  describe('grantPermission', () => {
    test('should grant permission to a user with a role', async () => {
      const entry = await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe('user');
      expect(entry.principalId.toString()).toBe(userId.toString());
      expect(entry.principalModel).toBe('User');
      expect(entry.resourceType).toBe('agent');
      expect(entry.resourceId.toString()).toBe(resourceId.toString());

      // Get the role to verify the permission bits are correctly set
      const role = await findRoleByIdentifier('agent_viewer');
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
      expect(entry.grantedBy.toString()).toBe(grantedById.toString());
      expect(entry.grantedAt).toBeInstanceOf(Date);
    });

    test('should grant permission to a group with a role', async () => {
      const entry = await grantPermission({
        principalType: 'group',
        principalId: groupId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_editor',
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe('group');
      expect(entry.principalId.toString()).toBe(groupId.toString());
      expect(entry.principalModel).toBe('Group');

      // Get the role to verify the permission bits are correctly set
      const role = await findRoleByIdentifier('agent_editor');
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
    });

    test('should grant public permission with a role', async () => {
      const entry = await grantPermission({
        principalType: 'public',
        principalId: null,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      expect(entry).toBeDefined();
      expect(entry.principalType).toBe('public');
      expect(entry.principalId).toBeUndefined();
      expect(entry.principalModel).toBeUndefined();

      // Get the role to verify the permission bits are correctly set
      const role = await findRoleByIdentifier('agent_viewer');
      expect(entry.permBits).toBe(role.permBits);
      expect(entry.roleId.toString()).toBe(role._id.toString());
    });

    test('should throw error for invalid principal type', async () => {
      await expect(
        grantPermission({
          principalType: 'invalid',
          principalId: userId,
          resourceType: 'agent',
          resourceId,
          accessRoleId: 'agent_viewer',
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Invalid principal type: invalid');
    });

    test('should throw error for missing principalId with user type', async () => {
      await expect(
        grantPermission({
          principalType: 'user',
          principalId: null,
          resourceType: 'agent',
          resourceId,
          accessRoleId: 'agent_viewer',
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Principal ID is required for user and group principals');
    });

    test('should throw error for non-existent role', async () => {
      await expect(
        grantPermission({
          principalType: 'user',
          principalId: userId,
          resourceType: 'agent',
          resourceId,
          accessRoleId: 'non_existent_role',
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Role non_existent_role not found');
    });

    test('should throw error for role-resource type mismatch', async () => {
      await expect(
        grantPermission({
          principalType: 'user',
          principalId: userId,
          resourceType: 'agent',
          resourceId,
          accessRoleId: 'project_viewer', // Project role for agent resource
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Role project_viewer is for project resources, not agent');
    });

    test('should update existing permission when granting to same principal and resource', async () => {
      // First grant with viewer role
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      // Then update to editor role
      const updated = await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_editor',
        grantedBy: grantedById,
      });

      const editorRole = await findRoleByIdentifier('agent_editor');
      expect(updated.permBits).toBe(editorRole.permBits);
      expect(updated.roleId.toString()).toBe(editorRole._id.toString());

      // Verify there's only one entry
      const entries = await AclEntry.find({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId,
      });
      expect(entries).toHaveLength(1);
    });
  });

  describe('checkPermission', () => {
    let otherResourceId;

    beforeEach(async () => {
      // Reset the mock implementation for getUserPrincipals
      getUserPrincipals.mockReset();

      // Setup test data
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      otherResourceId = new mongoose.Types.ObjectId();
      await grantPermission({
        principalType: 'group',
        principalId: groupId,
        resourceType: 'agent',
        resourceId: otherResourceId,
        accessRoleId: 'agent_editor',
        grantedBy: grantedById,
      });
    });

    test('should check permission for user principal', async () => {
      // Mock getUserPrincipals to return just the user principal
      getUserPrincipals.mockResolvedValue([{ principalType: 'user', principalId: userId }]);

      const hasViewPermission = await checkPermission({
        userId,
        resourceType: 'agent',
        resourceId,
        requiredPermission: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      expect(hasViewPermission).toBe(true);

      // Check higher permission level that user doesn't have
      const hasEditPermission = await checkPermission({
        userId,
        resourceType: 'agent',
        resourceId,
        requiredPermission: 3, // RoleBits.EDITOR = VIEW + EDIT
      });

      expect(hasEditPermission).toBe(false);
    });

    test('should check permission for user and group principals', async () => {
      // Mock getUserPrincipals to return both user and group principals
      getUserPrincipals.mockResolvedValue([
        { principalType: 'user', principalId: userId },
        { principalType: 'group', principalId: groupId },
      ]);

      // Check original resource (user has access)
      const hasViewOnOriginal = await checkPermission({
        userId,
        resourceType: 'agent',
        resourceId,
        requiredPermission: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      expect(hasViewOnOriginal).toBe(true);

      // Check other resource (group has access)
      const hasViewOnOther = await checkPermission({
        userId,
        resourceType: 'agent',
        resourceId: otherResourceId,
        requiredPermission: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      // Group has agent_editor role which includes viewer permissions
      expect(hasViewOnOther).toBe(true);
    });

    test('should check permission for public access', async () => {
      const publicResourceId = new mongoose.Types.ObjectId();

      // Grant public access to a resource
      await grantPermission({
        principalType: 'public',
        principalId: null,
        resourceType: 'agent',
        resourceId: publicResourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      // Mock getUserPrincipals to return user, group, and public principals
      getUserPrincipals.mockResolvedValue([
        { principalType: 'user', principalId: userId },
        { principalType: 'group', principalId: groupId },
        { principalType: 'public' },
      ]);

      const hasPublicAccess = await checkPermission({
        userId,
        resourceType: 'agent',
        resourceId: publicResourceId,
        requiredPermission: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      expect(hasPublicAccess).toBe(true);
    });

    test('should return false for invalid permission bits', async () => {
      getUserPrincipals.mockResolvedValue([{ principalType: 'user', principalId: userId }]);

      await expect(
        checkPermission({
          userId,
          resourceType: 'agent',
          resourceId,
          requiredPermission: 'invalid',
        }),
      ).rejects.toThrow('requiredPermission must be a positive number');

      const nonExistentResource = await checkPermission({
        userId,
        resourceType: 'agent',
        resourceId: new mongoose.Types.ObjectId(),
        requiredPermission: 1, // RoleBits.VIEWER
      });

      expect(nonExistentResource).toBe(false);
    });

    test('should return false if user has no principals', async () => {
      getUserPrincipals.mockResolvedValue([]);

      const hasPermission = await checkPermission({
        userId,
        resourceType: 'agent',
        resourceId,
        requiredPermission: 1, // RoleBits.VIEWER
      });

      expect(hasPermission).toBe(false);
    });
  });

  describe('getEffectivePermissions', () => {
    beforeEach(async () => {
      // Reset the mock implementation for getUserPrincipals
      getUserPrincipals.mockReset();

      // Setup test data with multiple permissions from different sources
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: 'group',
        principalId: groupId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_editor',
        grantedBy: grantedById,
      });

      // Create another resource with public permission
      const publicResourceId = new mongoose.Types.ObjectId();
      await grantPermission({
        principalType: 'public',
        principalId: null,
        resourceType: 'agent',
        resourceId: publicResourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      // Setup a resource with inherited permission
      const projectId = new mongoose.Types.ObjectId();
      const childResourceId = new mongoose.Types.ObjectId();

      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'project',
        resourceId: projectId,
        accessRoleId: 'project_viewer',
        grantedBy: grantedById,
      });

      await AclEntry.create({
        principalType: 'user',
        principalId: userId,
        principalModel: 'User',
        resourceType: 'agent',
        resourceId: childResourceId,
        permBits: RoleBits.VIEWER,
        roleId: (await findRoleByIdentifier('agent_viewer'))._id,
        grantedBy: grantedById,
        grantedAt: new Date(),
        inheritedFrom: projectId,
      });
    });

    test('should get effective permissions from multiple sources', async () => {
      // Mock getUserPrincipals to return both user and group principals
      getUserPrincipals.mockResolvedValue([
        { principalType: 'user', principalId: userId },
        { principalType: 'group', principalId: groupId },
      ]);

      const effective = await getEffectivePermissions({
        userId,
        resourceType: 'agent',
        resourceId,
      });

      // Should return the combined permission bits from both user (VIEWER=1) and group (EDITOR=3)
      // EDITOR includes VIEWER, so result should be 3 (VIEW + EDIT)
      expect(effective).toBe(RoleBits.EDITOR); // 3 = VIEW + EDIT
    });

    test('should get effective permissions from inherited permissions', async () => {
      // Find the child resource ID
      const inheritedEntry = await AclEntry.findOne({ inheritedFrom: { $exists: true } });
      const childResourceId = inheritedEntry.resourceId;

      // Mock getUserPrincipals to return user principal
      getUserPrincipals.mockResolvedValue([{ principalType: 'user', principalId: userId }]);

      const effective = await getEffectivePermissions({
        userId,
        resourceType: 'agent',
        resourceId: childResourceId,
      });

      // Should return VIEWER permission bits from inherited permission
      expect(effective).toBe(RoleBits.VIEWER); // 1 = VIEW
    });

    test('should return 0 for non-existent permissions', async () => {
      getUserPrincipals.mockResolvedValue([{ principalType: 'user', principalId: userId }]);

      const nonExistentResource = new mongoose.Types.ObjectId();
      const effective = await getEffectivePermissions({
        userId,
        resourceType: 'agent',
        resourceId: nonExistentResource,
      });

      // Should return 0 for no permissions
      expect(effective).toBe(0);
    });

    test('should return 0 if user has no principals', async () => {
      getUserPrincipals.mockResolvedValue([]);

      const effective = await getEffectivePermissions({
        userId,
        resourceType: 'agent',
        resourceId,
      });

      // Should return 0 for no permissions
      expect(effective).toBe(0);
    });
  });

  describe('findAccessibleResources', () => {
    beforeEach(async () => {
      // Reset the mock implementation for getUserPrincipals
      getUserPrincipals.mockReset();

      // Setup test data with multiple resources
      const resource1 = new mongoose.Types.ObjectId();
      const resource2 = new mongoose.Types.ObjectId();
      const resource3 = new mongoose.Types.ObjectId();

      // User can view resource 1
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId: resource1,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      // User can edit resource 2
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId: resource2,
        accessRoleId: 'agent_editor',
        grantedBy: grantedById,
      });

      // Group can view resource 3
      await grantPermission({
        principalType: 'group',
        principalId: groupId,
        resourceType: 'agent',
        resourceId: resource3,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });
    });

    test('should find resources user can view', async () => {
      // Mock getUserPrincipals to return user principal
      getUserPrincipals.mockResolvedValue([{ principalType: 'user', principalId: userId }]);

      const viewableResources = await findAccessibleResources({
        userId,
        resourceType: 'agent',
        requiredPermissions: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      // Should find both resources (viewer role is included in editor role)
      expect(viewableResources).toHaveLength(2);
    });

    test('should find resources user can edit', async () => {
      // Mock getUserPrincipals to return user principal
      getUserPrincipals.mockResolvedValue([{ principalType: 'user', principalId: userId }]);

      const editableResources = await findAccessibleResources({
        userId,
        resourceType: 'agent',
        requiredPermissions: 3, // RoleBits.EDITOR = VIEW + EDIT
      });

      // Should find only one resource (only the editor resource has EDIT permission)
      expect(editableResources).toHaveLength(1);
    });

    test('should find resources accessible via group membership', async () => {
      // Mock getUserPrincipals to return user and group principals
      getUserPrincipals.mockResolvedValue([
        { principalType: 'user', principalId: userId },
        { principalType: 'group', principalId: groupId },
      ]);

      const viewableResources = await findAccessibleResources({
        userId,
        resourceType: 'agent',
        requiredPermissions: 1, // RoleBits.VIEWER // 1 = VIEW
      });

      // Should find all three resources
      expect(viewableResources).toHaveLength(3);
    });

    test('should return empty array for invalid permissions', async () => {
      getUserPrincipals.mockResolvedValue([{ principalType: 'user', principalId: userId }]);

      await expect(
        findAccessibleResources({
          userId,
          resourceType: 'agent',
          requiredPermissions: 'invalid',
        }),
      ).rejects.toThrow('requiredPermissions must be a positive number');

      const nonExistentType = await findAccessibleResources({
        userId,
        resourceType: 'non_existent_type',
        requiredPermissions: 1, // RoleBits.VIEWER
      });

      expect(nonExistentType).toEqual([]);
    });

    test('should return empty array if user has no principals', async () => {
      getUserPrincipals.mockResolvedValue([]);

      const resources = await findAccessibleResources({
        userId,
        resourceType: 'agent',
        requiredPermissions: 1, // RoleBits.VIEWER
      });

      expect(resources).toEqual([]);
    });
  });

  describe('getAvailableRoles', () => {
    test('should get all roles for a resource type', async () => {
      const roles = await getAvailableRoles({
        resourceType: 'agent',
      });

      expect(roles).toHaveLength(3);
      expect(roles.map((r) => r.accessRoleId).sort()).toEqual(
        ['agent_editor', 'agent_owner', 'agent_viewer'].sort(),
      );
    });

    test('should return empty array for non-existent resource type', async () => {
      const roles = await getAvailableRoles({
        resourceType: 'non_existent_type',
      });

      expect(roles).toEqual([]);
    });
  });

  describe('bulkUpdateResourcePermissions', () => {
    const otherUserId = new mongoose.Types.ObjectId();

    beforeEach(async () => {
      // Setup existing permissions for testing
      await grantPermission({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: 'group',
        principalId: groupId,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_editor',
        grantedBy: grantedById,
      });

      await grantPermission({
        principalType: 'public',
        principalId: null,
        resourceType: 'agent',
        resourceId,
        accessRoleId: 'agent_viewer',
        grantedBy: grantedById,
      });
    });

    test('should grant new permissions in bulk', async () => {
      const newResourceId = new mongoose.Types.ObjectId();
      const updatedPrincipals = [
        {
          type: 'user',
          id: userId,
          accessRoleId: 'agent_viewer',
        },
        {
          type: 'user',
          id: otherUserId,
          accessRoleId: 'agent_editor',
        },
        {
          type: 'group',
          id: groupId,
          accessRoleId: 'agent_owner',
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: 'agent',
        resourceId: newResourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(3);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(0);

      // Verify permissions were created
      const aclEntries = await AclEntry.find({
        resourceType: 'agent',
        resourceId: newResourceId,
      });
      expect(aclEntries).toHaveLength(3);
    });

    test('should update existing permissions in bulk', async () => {
      const updatedPrincipals = [
        {
          type: 'user',
          id: userId,
          accessRoleId: 'agent_editor', // Upgrade from viewer to editor
        },
        {
          type: 'group',
          id: groupId,
          accessRoleId: 'agent_owner', // Upgrade from editor to owner
        },
        {
          type: 'public',
          accessRoleId: 'agent_viewer', // Keep same role
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: 'agent',
        resourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      // Function puts all updatedPrincipals in granted array since it uses upserts
      expect(results.granted).toHaveLength(3);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(0);

      // Verify updates
      const userEntry = await AclEntry.findOne({
        principalType: 'user',
        principalId: userId,
        resourceType: 'agent',
        resourceId,
      }).populate('roleId', 'accessRoleId');
      expect(userEntry.roleId.accessRoleId).toBe('agent_editor');

      const groupEntry = await AclEntry.findOne({
        principalType: 'group',
        principalId: groupId,
        resourceType: 'agent',
        resourceId,
      }).populate('roleId', 'accessRoleId');
      expect(groupEntry.roleId.accessRoleId).toBe('agent_owner');
    });

    test('should revoke specified permissions', async () => {
      const revokedPrincipals = [
        {
          type: 'group',
          id: groupId,
        },
        {
          type: 'public',
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: 'agent',
        resourceId,
        revokedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(0);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(2); // Group and public revoked
      expect(results.errors).toHaveLength(0);

      // Verify only user permission remains
      const remainingEntries = await AclEntry.find({
        resourceType: 'agent',
        resourceId,
      });
      expect(remainingEntries).toHaveLength(1);
      expect(remainingEntries[0].principalType).toBe('user');
      expect(remainingEntries[0].principalId.toString()).toBe(userId.toString());
    });

    test('should handle mixed operations (grant, update, revoke)', async () => {
      const updatedPrincipals = [
        {
          type: 'user',
          id: userId,
          accessRoleId: 'agent_owner', // Update existing
        },
        {
          type: 'user',
          id: otherUserId,
          accessRoleId: 'agent_viewer', // New permission
        },
      ];

      const revokedPrincipals = [
        {
          type: 'group',
          id: groupId,
        },
        {
          type: 'public',
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: 'agent',
        resourceId,
        updatedPrincipals,
        revokedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(2); // Both users granted (function uses upserts)
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(2); // Group and public revoked
      expect(results.errors).toHaveLength(0);

      // Verify final state
      const finalEntries = await AclEntry.find({
        resourceType: 'agent',
        resourceId,
      }).populate('roleId', 'accessRoleId');

      expect(finalEntries).toHaveLength(2);

      const userEntry = finalEntries.find((e) => e.principalId.toString() === userId.toString());
      expect(userEntry.roleId.accessRoleId).toBe('agent_owner');

      const otherUserEntry = finalEntries.find(
        (e) => e.principalId.toString() === otherUserId.toString(),
      );
      expect(otherUserEntry.roleId.accessRoleId).toBe('agent_viewer');
    });

    test('should handle errors for invalid roles gracefully', async () => {
      const updatedPrincipals = [
        {
          type: 'user',
          id: userId,
          accessRoleId: 'agent_viewer', // Valid
        },
        {
          type: 'user',
          id: otherUserId,
          accessRoleId: 'non_existent_role', // Invalid
        },
        {
          type: 'group',
          id: groupId,
          accessRoleId: 'project_viewer', // Wrong resource type
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: 'agent',
        resourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(1); // Only valid user permission
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(2); // Two invalid permissions

      // Check error details
      expect(results.errors[0].error).toContain('Role non_existent_role not found');
      expect(results.errors[1].error).toContain('Role project_viewer not found');
    });

    test('should handle empty arrays (no operations)', async () => {
      const results = await bulkUpdateResourcePermissions({
        resourceType: 'agent',
        resourceId,
        updatedPrincipals: [],
        revokedPrincipals: [],
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(0);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(0);

      // Verify no changes to existing permissions (since no operations were performed)
      const remainingEntries = await AclEntry.find({
        resourceType: 'agent',
        resourceId,
      });
      expect(remainingEntries).toHaveLength(3); // Original permissions still exist
    });

    test('should throw error for invalid updatedPrincipals array', async () => {
      await expect(
        bulkUpdateResourcePermissions({
          resourceType: 'agent',
          resourceId,
          updatedPrincipals: 'not an array',
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('updatedPrincipals must be an array');
    });

    test('should throw error for invalid resource ID', async () => {
      await expect(
        bulkUpdateResourcePermissions({
          resourceType: 'agent',
          resourceId: 'invalid-id',
          permissions: [],
          grantedBy: grantedById,
        }),
      ).rejects.toThrow('Invalid resource ID: invalid-id');
    });

    test('should handle public permissions correctly', async () => {
      const updatedPrincipals = [
        {
          type: 'public',
          accessRoleId: 'agent_editor', // Update public permission
        },
        {
          type: 'user',
          id: otherUserId,
          accessRoleId: 'agent_viewer', // New user permission
        },
      ];

      const revokedPrincipals = [
        {
          type: 'user',
          id: userId,
        },
        {
          type: 'group',
          id: groupId,
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: 'agent',
        resourceId,
        updatedPrincipals,
        revokedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(2); // Public and new user
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(2); // Existing user and group revoked
      expect(results.errors).toHaveLength(0);

      // Verify public permission was updated
      const publicEntry = await AclEntry.findOne({
        principalType: 'public',
        resourceType: 'agent',
        resourceId,
      }).populate('roleId', 'accessRoleId');

      expect(publicEntry).toBeDefined();
      expect(publicEntry.roleId.accessRoleId).toBe('agent_editor');
    });

    test('should work with different resource types', async () => {
      // Test with project resources
      const projectResourceId = new mongoose.Types.ObjectId();
      const updatedPrincipals = [
        {
          type: 'user',
          id: userId,
          accessRoleId: 'project_viewer',
        },
        {
          type: 'group',
          id: groupId,
          accessRoleId: 'project_editor',
        },
      ];

      const results = await bulkUpdateResourcePermissions({
        resourceType: 'project',
        resourceId: projectResourceId,
        updatedPrincipals,
        grantedBy: grantedById,
      });

      expect(results.granted).toHaveLength(2);
      expect(results.updated).toHaveLength(0);
      expect(results.revoked).toHaveLength(0);
      expect(results.errors).toHaveLength(0);

      // Verify permissions were created with correct resource type
      const projectEntries = await AclEntry.find({
        resourceType: 'project',
        resourceId: projectResourceId,
      });
      expect(projectEntries).toHaveLength(2);
      expect(projectEntries.every((e) => e.resourceType === 'project')).toBe(true);
    });
  });
});
